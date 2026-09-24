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
            ApiError::NotFound => (StatusCode::NOT_FOUND, "見つかりません".into()),
            ApiError::Unauthorized => (StatusCode::UNAUTHORIZED, "ログインが必要です".into()),
            ApiError::Forbidden => (StatusCode::FORBIDDEN, "この操作の権限がありません".into()),
            ApiError::BadRequest(m) => (StatusCode::BAD_REQUEST, m.clone()),
            ApiError::Conflict(m) => (StatusCode::CONFLICT, m.clone()),
            ApiError::Db(sqlx::Error::RowNotFound) => {
                (StatusCode::NOT_FOUND, "見つかりません".into())
            }
            ApiError::Db(e) => {
                tracing::error!("db error: {e:?}");
                (StatusCode::INTERNAL_SERVER_ERROR, "サーバーエラーが発生しました".into())
            }
            ApiError::Internal(e) => {
                tracing::error!("internal: {e:?}");
                (StatusCode::INTERNAL_SERVER_ERROR, "サーバーエラーが発生しました".into())
            }
            ApiError::Io(e) => {
                tracing::error!("io: {e:?}");
                (StatusCode::INTERNAL_SERVER_ERROR, "サーバーエラーが発生しました".into())
            }
            ApiError::Multipart(e) => (StatusCode::BAD_REQUEST, format!("multipart: {e}")),
            ApiError::Jwt(_) => (StatusCode::UNAUTHORIZED, "ログインが必要です".into()),
            ApiError::PasswordHash => (StatusCode::INTERNAL_SERVER_ERROR, "hash error".into()),
        };
        (status, Json(json!({"error": msg}))).into_response()
    }
}

pub type ApiResult<T> = Result<T, ApiError>;
