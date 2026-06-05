use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use axum::{
    async_trait,
    extract::FromRequestParts,
    http::{header, request::Parts, StatusCode},
};
use chrono::{Duration, Utc};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{error::ApiError, models::UserRole, state::AppState};

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub sub: Uuid,
    pub email: String,
    pub role: UserRole,
    pub exp: i64,
}

pub fn hash_password(plain: &str) -> Result<String, ApiError> {
    let salt = SaltString::generate(&mut OsRng);
    let argon = Argon2::default();
    argon
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

pub fn issue_token(secret: &str, claims: &Claims) -> Result<String, ApiError> {
    let token = encode(
        &Header::default(),
        claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )?;
    Ok(token)
}

pub fn build_claims(id: Uuid, email: &str, role: UserRole) -> Claims {
    Claims {
        sub: id,
        email: email.to_string(),
        role,
        exp: (Utc::now() + Duration::hours(12)).timestamp(),
    }
}

pub struct AuthUser(pub Claims);

#[async_trait]
impl FromRequestParts<AppState> for AuthUser {
    type Rejection = ApiError;

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, ApiError> {
        let header_val = parts
            .headers
            .get(header::AUTHORIZATION)
            .and_then(|v| v.to_str().ok())
            .ok_or(ApiError::Unauthorized)?;
        let token = header_val
            .strip_prefix("Bearer ")
            .ok_or(ApiError::Unauthorized)?;
        let data = decode::<Claims>(
            token,
            &DecodingKey::from_secret(state.config.jwt_secret.as_bytes()),
            &Validation::default(),
        )
        .map_err(|_| ApiError::Unauthorized)?;
        Ok(AuthUser(data.claims))
    }
}

impl AuthUser {
    pub fn require_role(&self, allowed: &[UserRole]) -> Result<(), ApiError> {
        if allowed.contains(&self.0.role) {
            Ok(())
        } else {
            Err(ApiError::Forbidden)
        }
    }

    pub fn is_admin(&self) -> bool {
        self.0.role == UserRole::Admin
    }

    pub fn can_approve(&self) -> bool {
        matches!(self.0.role, UserRole::Approver | UserRole::Admin)
    }
}

// Helper for axum manual error mapping when needed in tests
#[allow(dead_code)]
pub const UNAUTHORIZED_STATUS: StatusCode = StatusCode::UNAUTHORIZED;
