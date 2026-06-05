use axum::{extract::State, Json};

use crate::{
    auth::{build_claims, hash_password, issue_token, verify_password, AuthUser},
    error::{ApiError, ApiResult},
    models::{AuthResp, LoginReq, RegisterReq, User, UserPublic, UserRole},
    state::AppState,
};

pub async fn register(
    State(state): State<AppState>,
    Json(req): Json<RegisterReq>,
) -> ApiResult<Json<AuthResp>> {
    if req.email.trim().is_empty() || req.password.len() < 8 || req.name.trim().is_empty() {
        return Err(ApiError::BadRequest(
            "email/password(>=8)/name required".into(),
        ));
    }
    let exists: Option<(uuid::Uuid,)> =
        sqlx::query_as("SELECT id FROM users WHERE email = $1")
            .bind(&req.email)
            .fetch_optional(&state.db)
            .await?;
    if exists.is_some() {
        return Err(ApiError::Conflict("email already registered".into()));
    }
    let hash = hash_password(&req.password)?;
    let user: User = sqlx::query_as(
        "INSERT INTO users (email, password_hash, name, role)
         VALUES ($1, $2, $3, 'employee') RETURNING *",
    )
    .bind(&req.email)
    .bind(&hash)
    .bind(&req.name)
    .fetch_one(&state.db)
    .await?;
    let claims = build_claims(user.id, &user.email, user.role.clone());
    let token = issue_token(&state.config.jwt_secret, &claims)?;
    Ok(Json(AuthResp {
        token,
        user: UserPublic::from(user),
    }))
}

pub async fn login(
    State(state): State<AppState>,
    Json(req): Json<LoginReq>,
) -> ApiResult<Json<AuthResp>> {
    let user: Option<User> = sqlx::query_as("SELECT * FROM users WHERE email = $1")
        .bind(&req.email)
        .fetch_optional(&state.db)
        .await?;
    let Some(user) = user else {
        return Err(ApiError::Unauthorized);
    };
    if !verify_password(&req.password, &user.password_hash)? {
        return Err(ApiError::Unauthorized);
    }
    let claims = build_claims(user.id, &user.email, user.role.clone());
    let token = issue_token(&state.config.jwt_secret, &claims)?;
    Ok(Json(AuthResp {
        token,
        user: UserPublic::from(user),
    }))
}

pub async fn me(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
) -> ApiResult<Json<UserPublic>> {
    let user: User = sqlx::query_as("SELECT * FROM users WHERE id = $1")
        .bind(claims.sub)
        .fetch_one(&state.db)
        .await?;
    Ok(Json(UserPublic::from(user)))
}

#[allow(dead_code)]
pub fn allowed_for_admin() -> [UserRole; 1] {
    [UserRole::Admin]
}
