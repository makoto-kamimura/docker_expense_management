use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use axum::{
    async_trait,
    extract::FromRequestParts,
    http::{header, request::Parts, HeaderMap},
};
use chrono::{Duration, Utc};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{error::ApiError, models::Member, state::AppState};

/// ログインを維持できる最長の期間 (ログインした時刻から)
const SESSION_LIFETIME: Duration = Duration::days(30);
/// この期間使わなければログインが切れる。使っている間は /auth/refresh で延ばす
const IDLE_TIMEOUT: Duration = Duration::days(14);

/// トークンにはユーザー ID と時刻だけを入れる。所属家族や権限は毎リクエスト DB から読む。
#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub sub: Uuid,
    pub exp: i64,
    /// 発行した時刻。クライアントはこれを見て更新するかを決める
    #[serde(default)]
    pub iat: i64,
    /// ログインした時刻。更新しても変わらない (以前のトークンにはないので 0)
    #[serde(default)]
    pub auth_time: i64,
}

pub fn hash_password(plain: &str) -> Result<String, ApiError> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(plain.as_bytes(), &salt)
        .map(|h| h.to_string())
        .map_err(|_| ApiError::PasswordHash)
}

pub fn verify_password(plain: &str, hash: &str) -> Result<bool, ApiError> {
    let parsed = PasswordHash::new(hash).map_err(|_| ApiError::PasswordHash)?;
    Ok(Argon2::default()
        .verify_password(plain.as_bytes(), &parsed)
        .is_ok())
}

/// 有効期限は「最後に使ってから14日」と「ログインから30日」の早いほう。
/// ログインから30日を過ぎていれば None (もう延ばせない)。
fn token_expiry(now: i64, auth_time: i64) -> Option<i64> {
    let limit = auth_time + SESSION_LIFETIME.num_seconds();
    (now < limit).then(|| (now + IDLE_TIMEOUT.num_seconds()).min(limit))
}

/// トークンを発行する。ログインのときは `auth_time` に今の時刻を、更新のときは元のトークンの値を渡す。
pub fn issue_token(secret: &str, user_id: Uuid, auth_time: i64) -> Result<String, ApiError> {
    let now = Utc::now().timestamp();
    let claims = Claims {
        sub: user_id,
        exp: token_expiry(now, auth_time).ok_or(ApiError::Unauthorized)?,
        iat: now,
        auth_time,
    };
    Ok(encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )?)
}

pub const MEMBER_SELECT: &str = "SELECT u.id, m.family_id, u.email, u.name, u.avatar_url,
        m.can_request, m.can_review, m.is_admin
   FROM users u JOIN family_members m ON m.user_id = u.id";

pub async fn load_member(state: &AppState, user_id: Uuid) -> Result<Option<Member>, ApiError> {
    Ok(sqlx::query_as(&format!("{MEMBER_SELECT} WHERE u.id = $1"))
        .bind(user_id)
        .fetch_optional(&state.db)
        .await?)
}

/// `Authorization: Bearer` のトークンを検証して中身を返す
pub fn bearer_claims(headers: &HeaderMap, state: &AppState) -> Result<Claims, ApiError> {
    let token = headers
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .ok_or(ApiError::Unauthorized)?;
    let data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(state.config.jwt_secret.as_bytes()),
        &Validation::default(),
    )
    .map_err(|_| ApiError::Unauthorized)?;
    Ok(data.claims)
}

/// ログイン中の家族メンバー
pub struct AuthUser(pub Member);

#[async_trait]
impl FromRequestParts<AppState> for AuthUser {
    type Rejection = ApiError;

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, ApiError> {
        let claims = bearer_claims(&parts.headers, state)?;
        let member = load_member(state, claims.sub)
            .await?
            .ok_or(ApiError::Unauthorized)?;
        Ok(AuthUser(member))
    }
}

impl AuthUser {
    pub fn require_admin(&self) -> Result<(), ApiError> {
        if self.0.is_admin {
            Ok(())
        } else {
            Err(ApiError::Forbidden)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const DAY: i64 = 24 * 60 * 60;

    #[test]
    fn expiry_is_idle_timeout_after_login() {
        assert_eq!(token_expiry(1_000, 1_000), Some(1_000 + 14 * DAY));
    }

    #[test]
    fn expiry_is_capped_by_session_lifetime() {
        // ログインから20日後に更新しても、ログインから30日で切れる
        assert_eq!(token_expiry(20 * DAY, 0), Some(30 * DAY));
    }

    #[test]
    fn cannot_extend_after_session_lifetime() {
        assert_eq!(token_expiry(30 * DAY, 0), None);
        assert_eq!(token_expiry(31 * DAY, 0), None);
    }
}
