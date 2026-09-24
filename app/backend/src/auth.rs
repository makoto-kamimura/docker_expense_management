use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use axum::{async_trait, extract::FromRequestParts, http::header, http::request::Parts};
use chrono::{Duration, Utc};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{error::ApiError, models::Member, state::AppState};

/// トークンにはユーザー ID だけを入れる。所属家族や権限は毎リクエスト DB から読む。
#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub sub: Uuid,
    pub exp: i64,
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

pub fn issue_token(secret: &str, user_id: Uuid) -> Result<String, ApiError> {
    let claims = Claims {
        sub: user_id,
        exp: (Utc::now() + Duration::hours(12)).timestamp(),
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

/// ログイン中の家族メンバー
pub struct AuthUser(pub Member);

#[async_trait]
impl FromRequestParts<AppState> for AuthUser {
    type Rejection = ApiError;

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, ApiError> {
        let token = parts
            .headers
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
        let member = load_member(state, data.claims.sub)
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
