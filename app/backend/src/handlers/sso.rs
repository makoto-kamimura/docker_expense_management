//! SSO (OpenID Connect) でのログイン。Web とモバイルで同じ流れを使う。
//!
//! 1. (連携のときだけ) POST /me/identities/sso/intent … ログイン中の利用者に、使い捨ての intent を発行
//! 2. GET  /auth/sso/start    … クライアントが作った code_challenge を受け取り、認証サーバーへ送る
//! 3. GET  /auth/sso/callback … 認証サーバーから戻る。使い捨ての結果コードを付けてクライアントへ戻す
//! 4. POST /auth/sso/exchange … クライアントが結果コードと code_verifier を送る。ここでログイン / 連携が成立する
//!
//! 新しい利用者は作らない。SSO で入れるのは、パスワードでログインしたうえで連携した人だけ。

use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::{Html, IntoResponse, Redirect, Response},
    Json,
};
use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use serde_json::json;
use uuid::Uuid;

use crate::{
    auth::{issue_token, load_member, AuthUser, LOGIN_SSO},
    error::{ApiError, ApiResult},
    oidc::{self, OidcClient, Rejected, PROVIDER_SSO},
    state::AppState,
};

/// 開始から認証サーバーでの操作を終えるまでの猶予
const FLOW_TTL: Duration = Duration::minutes(10);
/// 結果コードの有効期間 (戻ってすぐ交換する)
const RESULT_TTL_SECONDS: i32 = 60;

fn client(state: &AppState) -> ApiResult<&OidcClient> {
    state.oidc.as_deref().ok_or(ApiError::NotFound)
}

/// ログイン画面が「SSO でログイン」を出すかどうかと、その名前
pub async fn providers(State(state): State<AppState>) -> Json<serde_json::Value> {
    Json(json!({
        "sso": state.oidc.is_some(),
        "sso_name": state.oidc.as_ref().map(|c| c.config.display_name.clone()),
    }))
}

#[derive(Deserialize)]
pub struct StartQuery {
    mode: String,
    client: String,
    code_challenge: String,
    redirect_uri: Option<String>,
    intent: Option<String>,
}

pub async fn start(State(state): State<AppState>, Query(q): Query<StartQuery>) -> ApiResult<Redirect> {
    let c = client(&state)?;
    let g = &c.config;
    if !oidc::is_valid_challenge(&q.code_challenge) {
        return Err(ApiError::BadRequest("code_challenge が正しくありません".into()));
    }
    let return_to = match q.client.as_str() {
        "web" => g.web_return_url(),
        "mobile" => {
            let uri = q.redirect_uri.as_deref().unwrap_or_default();
            if !oidc::mobile_redirect_allowed(uri, &g.mobile_redirect_prefixes) {
                return Err(ApiError::BadRequest("redirect_uri が許可されていません".into()));
            }
            uri.to_string()
        }
        _ => return Err(ApiError::BadRequest("client が正しくありません".into())),
    };

    sqlx::query("DELETE FROM oauth_flows WHERE expires_at < now()")
        .execute(&state.db)
        .await?;

    let state_token = oidc::random_token();
    let nonce = oidc::random_token();
    let server_verifier = oidc::random_token();
    let expires_at = Utc::now() + FLOW_TTL;

    match q.mode.as_str() {
        "login" => {
            sqlx::query(
                "INSERT INTO oauth_flows
                    (mode, state_hash, nonce, server_verifier, client_challenge, return_to, expires_at)
                 VALUES ('login', $1, $2, $3, $4, $5, $6)",
            )
            .bind(oidc::hash_token(&state_token))
            .bind(&nonce)
            .bind(&server_verifier)
            .bind(&q.code_challenge)
            .bind(&return_to)
            .bind(expires_at)
            .execute(&state.db)
            .await?;
        }
        "link" => {
            let intent = q.intent.as_deref().unwrap_or_default();
            // intent は 1 回だけ使える。使ったら消して state に進める
            let updated = sqlx::query(
                "UPDATE oauth_flows
                    SET intent_hash = NULL, state_hash = $1, nonce = $2, server_verifier = $3,
                        client_challenge = $4, return_to = $5, expires_at = $6
                  WHERE intent_hash = $7 AND mode = 'link' AND expires_at > now()",
            )
            .bind(oidc::hash_token(&state_token))
            .bind(&nonce)
            .bind(&server_verifier)
            .bind(&q.code_challenge)
            .bind(&return_to)
            .bind(expires_at)
            .bind(oidc::hash_token(intent))
            .execute(&state.db)
            .await?
            .rows_affected();
            if updated == 0 {
                return Ok(Redirect::to(&oidc::with_query(&return_to, "error", "expired")?));
            }
        }
        _ => return Err(ApiError::BadRequest("mode が正しくありません".into())),
    }

    let url = c
        .authorization_url(&state_token, &nonce, &oidc::pkce_challenge(&server_verifier))
        .await
        .map_err(|e| {
            tracing::error!("sso: cannot reach the identity provider: {e:#}");
            ApiError::Internal(anyhow::anyhow!("認証サーバーに接続できません"))
        })?;
    Ok(Redirect::to(&url))
}

#[derive(Deserialize)]
pub struct CallbackQuery {
    code: Option<String>,
    state: Option<String>,
    error: Option<String>,
}

#[derive(sqlx::FromRow)]
struct FlowAtCallback {
    id: Uuid,
    mode: String,
    nonce: Option<String>,
    server_verifier: Option<String>,
    return_to: Option<String>,
}

pub async fn callback(State(state): State<AppState>, Query(q): Query<CallbackQuery>) -> Response {
    match handle_callback(&state, q).await {
        Ok(url) => Redirect::to(&url).into_response(),
        Err(e) => {
            tracing::warn!("sso callback rejected: {e:?}");
            (
                StatusCode::BAD_REQUEST,
                Html(
                    "<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width'>\
                     <p>ログインの有効期限が切れたか、正しくない要求です。アプリに戻って、もう一度やり直してください。</p>",
                ),
            )
                .into_response()
        }
    }
}

async fn handle_callback(state: &AppState, q: CallbackQuery) -> anyhow::Result<String> {
    let c = state.oidc.as_deref().ok_or_else(|| anyhow::anyhow!("sso is disabled"))?;
    let state_token = q.state.ok_or_else(|| anyhow::anyhow!("missing state"))?;
    // state は 1 回だけ使える
    let flow: FlowAtCallback = sqlx::query_as(
        "UPDATE oauth_flows SET state_hash = NULL
          WHERE state_hash = $1 AND expires_at > now()
          RETURNING id, mode, nonce, server_verifier, return_to",
    )
    .bind(oidc::hash_token(&state_token))
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| anyhow::anyhow!("unknown or expired state"))?;
    let return_to = flow.return_to.clone().ok_or_else(|| anyhow::anyhow!("flow has no return_to"))?;

    match finish_sso(state, c, &flow, q.code, q.error).await {
        Ok((subject, email)) => {
            let result = oidc::random_token();
            sqlx::query(
                "UPDATE oauth_flows
                    SET result_hash = $1, result_subject = $2, result_email = $3,
                        nonce = NULL, server_verifier = NULL,
                        expires_at = now() + make_interval(secs => $4)
                  WHERE id = $5",
            )
            .bind(oidc::hash_token(&result))
            .bind(&subject)
            .bind(&email)
            .bind(RESULT_TTL_SECONDS)
            .bind(flow.id)
            .execute(&state.db)
            .await?;
            oidc::with_query(&return_to, "code", &result)
        }
        Err(reason) => {
            sqlx::query("DELETE FROM oauth_flows WHERE id = $1")
                .bind(flow.id)
                .execute(&state.db)
                .await?;
            oidc::with_query(&return_to, "error", reason)
        }
    }
}

/// 認証サーバーから受け取ったものを確かめ、(sub, email) を返す。失敗したときはクライアントに返す理由
async fn finish_sso(
    state: &AppState,
    c: &OidcClient,
    flow: &FlowAtCallback,
    code: Option<String>,
    error: Option<String>,
) -> Result<(String, Option<String>), &'static str> {
    if error.is_some() {
        return Err("cancelled");
    }
    let (Some(code), Some(nonce), Some(verifier)) = (code, flow.nonce.as_deref(), flow.server_verifier.as_deref())
    else {
        return Err("failed");
    };
    let id_token = c.exchange_code(&code, verifier).await.map_err(|e| {
        tracing::warn!("sso token exchange failed: {e:#}");
        "failed"
    })?;
    let claims = match c.verify(&id_token, nonce).await {
        Ok(Ok(claims)) => claims,
        Ok(Err(Rejected::MfaRequired)) => {
            tracing::info!("sso: login without MFA was rejected");
            return Err("mfa_required");
        }
        Ok(Err(Rejected::Invalid(reason))) => {
            tracing::warn!("sso id_token rejected: {reason}");
            return Err("failed");
        }
        Err(e) => {
            tracing::warn!("sso id_token could not be verified: {e:#}");
            return Err("failed");
        }
    };
    if flow.mode == "login" {
        // 連携されていない SSO のアカウントは、ここで止める (新しい利用者は作らない)
        let linked: Option<(Uuid,)> =
            sqlx::query_as("SELECT user_id FROM user_identities WHERE provider = $1 AND subject = $2")
                .bind(PROVIDER_SSO)
                .bind(&claims.sub)
                .fetch_optional(&state.db)
                .await
                .map_err(|_| "failed")?;
        if linked.is_none() {
            tracing::info!("sso login: account is not linked");
            return Err("not_linked");
        }
    }
    Ok((claims.sub, claims.email))
}

#[derive(Deserialize)]
pub struct ExchangeReq {
    code: String,
    code_verifier: String,
}

#[derive(sqlx::FromRow)]
struct FlowAtExchange {
    mode: String,
    user_id: Option<Uuid>,
    client_challenge: Option<String>,
    result_subject: Option<String>,
    result_email: Option<String>,
}

/// 結果コードを、開始したクライアントの code_verifier と引き換えにする。
/// ログインならトークンを返し、連携なら (ログイン中の本人であることを確かめて) 登録する
pub async fn exchange(
    State(state): State<AppState>,
    auth: Option<AuthUser>,
    Json(req): Json<ExchangeReq>,
) -> ApiResult<Json<serde_json::Value>> {
    let g = &client(&state)?.config;
    // 結果コードは 1 回だけ使える。code_verifier が違っても消す (総当たりさせない)
    let flow: FlowAtExchange = sqlx::query_as(
        "DELETE FROM oauth_flows WHERE result_hash = $1 AND expires_at > now()
         RETURNING mode, user_id, client_challenge, result_subject, result_email",
    )
    .bind(oidc::hash_token(req.code.trim()))
    .fetch_optional(&state.db)
    .await?
    .ok_or(ApiError::Unauthorized)?;
    let challenge = flow.client_challenge.as_deref().unwrap_or_default();
    if !oidc::verify_pkce(&req.code_verifier, challenge) {
        tracing::warn!("sso exchange: code_verifier mismatch");
        return Err(ApiError::Unauthorized);
    }
    let subject = flow.result_subject.ok_or(ApiError::Unauthorized)?;

    match flow.mode.as_str() {
        "login" => {
            let (user_id,): (Uuid,) = sqlx::query_as(
                "UPDATE user_identities SET last_login_at = now()
                  WHERE provider = $1 AND subject = $2 RETURNING user_id",
            )
            .bind(PROVIDER_SSO)
            .bind(&subject)
            .fetch_optional(&state.db)
            .await?
            .ok_or(ApiError::Unauthorized)?;
            // パスワードのログインと同じく、家族に所属していない人は入れない
            let member = load_member(&state, user_id).await?.ok_or(ApiError::Unauthorized)?;
            tracing::info!(user_id = %user_id, "sso login succeeded");
            Ok(Json(json!({
                "mode": "login",
                "token": issue_token(&state.config.jwt_secret, user_id, Utc::now().timestamp(), LOGIN_SSO)?,
                "user": member,
            })))
        }
        "link" => {
            let AuthUser(me) = auth.ok_or(ApiError::Unauthorized)?;
            // 連携を始めた本人と、いまログインしている人が同じであること
            if flow.user_id != Some(me.id) {
                tracing::warn!(user_id = %me.id, "sso link: user mismatch");
                return Err(ApiError::Forbidden);
            }
            if oidc::link_denied(&me.email, &g.link_deny_email_domains) {
                return Err(demo_account_error());
            }
            link_identity(&state, me.id, &subject, flow.result_email.as_deref()).await?;
            tracing::info!(user_id = %me.id, "sso account linked");
            Ok(Json(json!({ "mode": "link", "email": flow.result_email })))
        }
        _ => Err(ApiError::Unauthorized),
    }
}

async fn link_identity(state: &AppState, user_id: Uuid, subject: &str, email: Option<&str>) -> ApiResult<()> {
    let owner: Option<(Uuid,)> =
        sqlx::query_as("SELECT user_id FROM user_identities WHERE provider = $1 AND subject = $2")
            .bind(PROVIDER_SSO)
            .bind(subject)
            .fetch_optional(&state.db)
            .await?;
    match owner {
        Some((owner,)) if owner != user_id => {
            return Err(ApiError::Conflict(
                "この SSO のアカウントは、ほかの利用者に連携されています".into(),
            ))
        }
        Some(_) => {
            // 同じアカウントをもう一度連携した。表示用のメールアドレスだけ新しくする
            sqlx::query("UPDATE user_identities SET email = $1 WHERE provider = $2 AND subject = $3")
                .bind(email)
                .bind(PROVIDER_SSO)
                .bind(subject)
                .execute(&state.db)
                .await?;
            return Ok(());
        }
        None => {}
    }
    let inserted = sqlx::query(
        "INSERT INTO user_identities (user_id, provider, subject, email) VALUES ($1, $2, $3, $4)
         ON CONFLICT DO NOTHING",
    )
    .bind(user_id)
    .bind(PROVIDER_SSO)
    .bind(subject)
    .bind(email)
    .execute(&state.db)
    .await?
    .rows_affected();
    if inserted == 0 {
        return Err(ApiError::Conflict(
            "別の SSO のアカウントと連携済みです。解除してから連携してください".into(),
        ));
    }
    Ok(())
}

fn demo_account_error() -> ApiError {
    ApiError::BadRequest("デモ用のアカウントには SSO を連携できません".into())
}

/// 連携を始める。ブラウザの遷移では Bearer を送れないので、ここで使い捨ての intent を渡す
pub async fn intent(State(state): State<AppState>, AuthUser(me): AuthUser) -> ApiResult<Json<serde_json::Value>> {
    let g = &client(&state)?.config;
    if oidc::link_denied(&me.email, &g.link_deny_email_domains) {
        return Err(demo_account_error());
    }
    let intent = oidc::random_token();
    sqlx::query("INSERT INTO oauth_flows (mode, user_id, intent_hash, expires_at) VALUES ('link', $1, $2, $3)")
        .bind(me.id)
        .bind(oidc::hash_token(&intent))
        .bind(Utc::now() + FLOW_TTL)
        .execute(&state.db)
        .await?;
    Ok(Json(json!({ "intent": intent })))
}

#[derive(Serialize, sqlx::FromRow)]
pub struct IdentityView {
    provider: String,
    email: Option<String>,
    created_at: DateTime<Utc>,
    last_login_at: Option<DateTime<Utc>>,
}

/// 自分の連携の一覧と、SSO が使えるか
pub async fn identities(
    State(state): State<AppState>,
    AuthUser(me): AuthUser,
) -> ApiResult<Json<serde_json::Value>> {
    let rows: Vec<IdentityView> = sqlx::query_as(
        "SELECT provider, email, created_at, last_login_at FROM user_identities
          WHERE user_id = $1 ORDER BY provider",
    )
    .bind(me.id)
    .fetch_all(&state.db)
    .await?;
    let can_link = state
        .oidc
        .as_ref()
        .is_some_and(|c| !oidc::link_denied(&me.email, &c.config.link_deny_email_domains));
    Ok(Json(json!({
        "sso_enabled": state.oidc.is_some(),
        "sso_name": state.oidc.as_ref().map(|c| c.config.display_name.clone()),
        "can_link": can_link,
        "identities": rows,
        "sso_only": me.sso_only,
        "login_method": me.login_method,
    })))
}

/// SSO の連携を解除する。パスワードは必ずあるので、解除してもログインできなくなることはない
pub async fn unlink_sso(
    State(state): State<AppState>,
    AuthUser(me): AuthUser,
) -> ApiResult<Json<serde_json::Value>> {
    let mut tx = state.db.begin().await?;
    let removed = sqlx::query("DELETE FROM user_identities WHERE user_id = $1 AND provider = $2")
        .bind(me.id)
        .bind(PROVIDER_SSO)
        .execute(&mut *tx)
        .await?
        .rows_affected();
    // 連携がなくなれば SSO では入れないので、「SSO だけ」も外す (締め出し防止)
    sqlx::query("UPDATE users SET sso_only = FALSE WHERE id = $1")
        .bind(me.id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    if removed > 0 {
        tracing::info!(user_id = %me.id, "sso account unlinked");
    }
    Ok(Json(json!({ "unlinked": removed > 0 })))
}

#[derive(Deserialize)]
pub struct SsoOnlyReq {
    enabled: bool,
}

/// 「SSO だけでログインする」を切り替える。
/// オンにできるのは、SSO を連携していて、いま SSO でログインしている人だけ (SSO で入れることを確かめてから閉じる)。
/// オンにすると、パスワードで入っていたほかの端末のログインもその時点で切れる (AuthUser がトークンのログイン方法を見る)
pub async fn set_sso_only(
    State(state): State<AppState>,
    AuthUser(me): AuthUser,
    Json(req): Json<SsoOnlyReq>,
) -> ApiResult<Json<serde_json::Value>> {
    client(&state)?;
    if req.enabled {
        let linked: Option<(Uuid,)> =
            sqlx::query_as("SELECT user_id FROM user_identities WHERE user_id = $1 AND provider = $2")
                .bind(me.id)
                .bind(PROVIDER_SSO)
                .fetch_optional(&state.db)
                .await?;
        if linked.is_none() {
            return Err(ApiError::BadRequest("先に SSO のアカウントを連携してください".into()));
        }
        if me.login_method != LOGIN_SSO {
            return Err(ApiError::BadRequest(
                "SSO でログインし直してから有効にしてください (SSO で入れることを確かめるため)".into(),
            ));
        }
    }
    sqlx::query("UPDATE users SET sso_only = $1 WHERE id = $2")
        .bind(req.enabled)
        .bind(me.id)
        .execute(&state.db)
        .await?;
    tracing::info!(user_id = %me.id, enabled = req.enabled, "sso-only changed");
    Ok(Json(json!({ "sso_only": req.enabled })))
}
