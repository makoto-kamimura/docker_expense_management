use axum::{extract::State, Json};
use uuid::Uuid;

use crate::{
    auth::{hash_password, issue_token, load_member, verify_password, AuthUser},
    error::{ApiError, ApiResult},
    handlers::{
        chores,
        labels,
        family::{family_info, generate_invite_code},
    },
    models::{AuthResp, LoginReq, MeResp, RegisterReq, User},
    state::AppState,
};

pub async fn register(
    State(state): State<AppState>,
    Json(req): Json<RegisterReq>,
) -> ApiResult<Json<AuthResp>> {
    let email = req.email.trim().to_lowercase();
    if email.is_empty() || req.password.len() < 8 || req.name.trim().is_empty() {
        return Err(ApiError::BadRequest(
            "名前・メールアドレス・8文字以上のパスワードを入力してください".into(),
        ));
    }
    let family_name = req.family_name.as_deref().map(str::trim).filter(|s| !s.is_empty());
    let invite_code = req.invite_code.as_deref().map(str::trim).filter(|s| !s.is_empty());
    if family_name.is_some() == invite_code.is_some() {
        return Err(ApiError::BadRequest(
            "家族の名前 (新規作成) か招待コード (参加) のどちらかを入力してください".into(),
        ));
    }
    let exists: Option<(Uuid,)> = sqlx::query_as("SELECT id FROM users WHERE lower(email) = $1")
        .bind(&email)
        .fetch_optional(&state.db)
        .await?;
    if exists.is_some() {
        return Err(ApiError::Conflict("このメールアドレスは登録済みです".into()));
    }
    let hash = hash_password(&req.password)?;

    let mut tx = state.db.begin().await?;
    // 家族を作った人は全権限 (Admin)、招待コードで参加した人は Requester / Reviewer
    let (family_id, is_admin) = match (family_name, invite_code) {
        (Some(name), _) => {
            let (id,): (Uuid,) =
                sqlx::query_as("INSERT INTO families (name, invite_code) VALUES ($1, $2) RETURNING id")
                    .bind(name)
                    .bind(generate_invite_code())
                    .fetch_one(&mut *tx)
                    .await?;
            chores::create_defaults(&mut tx, id).await?;
            labels::create_defaults(&mut tx, id).await?;
            (id, true)
        }
        (None, Some(code)) => {
            let row: Option<(Uuid,)> =
                sqlx::query_as("SELECT id FROM families WHERE invite_code = $1")
                    .bind(code.to_uppercase())
                    .fetch_optional(&mut *tx)
                    .await?;
            let (id,) = row.ok_or_else(|| ApiError::BadRequest("招待コードが正しくありません".into()))?;
            (id, false)
        }
        (None, None) => unreachable!(),
    };
    let (user_id,): (Uuid,) = sqlx::query_as(
        "INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id",
    )
    .bind(&email)
    .bind(&hash)
    .bind(req.name.trim())
    .fetch_one(&mut *tx)
    .await?;
    sqlx::query(
        "INSERT INTO family_members (family_id, user_id, can_request, can_review, is_admin)
         VALUES ($1, $2, TRUE, TRUE, $3)",
    )
    .bind(family_id)
    .bind(user_id)
    .bind(is_admin)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;

    let user = load_member(&state, user_id).await?.ok_or(ApiError::NotFound)?;
    Ok(Json(AuthResp {
        token: issue_token(&state.config.jwt_secret, user_id)?,
        user,
    }))
}

pub async fn login(
    State(state): State<AppState>,
    Json(req): Json<LoginReq>,
) -> ApiResult<Json<AuthResp>> {
    let user: Option<User> =
        sqlx::query_as("SELECT id, password_hash FROM users WHERE lower(email) = lower($1)")
            .bind(req.email.trim())
            .fetch_optional(&state.db)
            .await?;
    let Some(user) = user else {
        return Err(ApiError::Unauthorized);
    };
    if !verify_password(&req.password, &user.password_hash)? {
        return Err(ApiError::Unauthorized);
    }
    // 家族に所属していないユーザーはログインさせない
    let member = load_member(&state, user.id).await?.ok_or(ApiError::Unauthorized)?;
    Ok(Json(AuthResp {
        token: issue_token(&state.config.jwt_secret, user.id)?,
        user: member,
    }))
}

pub async fn me(State(state): State<AppState>, AuthUser(me): AuthUser) -> ApiResult<Json<MeResp>> {
    let (onboarded,): (bool,) =
        sqlx::query_as("SELECT onboarded_at IS NOT NULL FROM users WHERE id = $1")
            .bind(me.id)
            .fetch_one(&state.db)
            .await?;
    let family = family_info(&state, &me).await?;
    Ok(Json(MeResp {
        member: me,
        family,
        onboarded,
    }))
}

/// 初回オンボーディングを見終えたことを記録する
pub async fn complete_onboarding(
    State(state): State<AppState>,
    AuthUser(me): AuthUser,
) -> ApiResult<Json<serde_json::Value>> {
    sqlx::query("UPDATE users SET onboarded_at = COALESCE(onboarded_at, now()) WHERE id = $1")
        .bind(me.id)
        .execute(&state.db)
        .await?;
    Ok(Json(serde_json::json!({ "onboarded": true })))
}
