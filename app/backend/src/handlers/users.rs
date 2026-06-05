use axum::{extract::State, Json};

use crate::{
    auth::AuthUser,
    error::{ApiError, ApiResult},
    models::{User, UserPublic, UserRole},
    state::AppState,
};

pub async fn list(
    State(state): State<AppState>,
    auth: AuthUser,
) -> ApiResult<Json<Vec<UserPublic>>> {
    if !matches!(auth.0.role, UserRole::Admin | UserRole::Approver) {
        return Err(ApiError::Forbidden);
    }
    let users: Vec<User> = sqlx::query_as("SELECT * FROM users ORDER BY created_at")
        .fetch_all(&state.db)
        .await?;
    Ok(Json(users.into_iter().map(UserPublic::from).collect()))
}
