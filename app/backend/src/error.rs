use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum ApiError {
    #[error("not found")]
    NotFound,
    #[error("unauthorized")]
    Unauthorized,
    #[error("forbidden")]
    Forbidden,
    #[error("bad request: {0}")]
    BadRequest(String),
    #[error("conflict: {0}")]
    Conflict(String),
    #[error("database error: {0}")]
    Db(#[from] sqlx::Error),
    #[error("internal error: {0}")]
    Internal(#[from] anyhow::Error),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("multipart error: {0}")]
    Multipart(#[from] axum::extract::multipart::MultipartError),
    #[error("jwt error: {0}")]
    Jwt(#[from] jsonwebtoken::errors::Error),
    #[error("password hash error")]
    PasswordHash,
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let (status, msg) = match &self {
            ApiError::NotFound => (StatusCode::NOT_FOUND, self.to_string()),
            ApiError::Unauthorized => (StatusCode::UNAUTHORIZED, self.to_string()),
            ApiError::Forbidden => (StatusCode::FORBIDDEN, self.to_string()),
            ApiError::BadRequest(_) => (StatusCode::BAD_REQUEST, self.to_string()),
            ApiError::Conflict(_) => (StatusCode::CONFLICT, self.to_string()),
            ApiError::Db(sqlx::Error::RowNotFound) => {
                (StatusCode::NOT_FOUND, "not found".into())
            }
            ApiError::Db(e) => {
                tracing::error!("db error: {e:?}");
                (StatusCode::INTERNAL_SERVER_ERROR, "internal error".into())
            }
            ApiError::Internal(e) => {
                tracing::error!("internal: {e:?}");
                (StatusCode::INTERNAL_SERVER_ERROR, "internal error".into())
            }
            ApiError::Io(e) => {
                tracing::error!("io: {e:?}");
                (StatusCode::INTERNAL_SERVER_ERROR, "internal error".into())
            }
            ApiError::Multipart(e) => (StatusCode::BAD_REQUEST, format!("multipart: {e}")),
            ApiError::Jwt(_) => (StatusCode::UNAUTHORIZED, "invalid token".into()),
            ApiError::PasswordHash => (StatusCode::INTERNAL_SERVER_ERROR, "hash error".into()),
        };
        (status, Json(json!({"error": msg}))).into_response()
    }
}

pub type ApiResult<T> = Result<T, ApiError>;
