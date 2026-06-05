use std::path::PathBuf;

use axum::{
    body::Body,
    extract::{Multipart, Path, State},
    http::{header, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use tokio::io::AsyncWriteExt;
use tokio_util::io::ReaderStream;
use uuid::Uuid;

use crate::{
    auth::AuthUser,
    error::{ApiError, ApiResult},
    models::{Expense, Receipt, UserRole},
    state::AppState,
};

pub async fn list(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Path(expense_id): Path<Uuid>,
) -> ApiResult<Json<Vec<Receipt>>> {
    let expense: Expense = sqlx::query_as("SELECT * FROM expenses WHERE id = $1")
        .bind(expense_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or(ApiError::NotFound)?;
    let can_view = expense.user_id == claims.sub
        || claims.role == UserRole::Admin
        || claims.role == UserRole::Approver;
    if !can_view {
        return Err(ApiError::Forbidden);
    }
    let rows: Vec<Receipt> = sqlx::query_as(
        "SELECT * FROM receipts WHERE expense_id = $1 ORDER BY uploaded_at",
    )
    .bind(expense_id)
    .fetch_all(&state.db)
    .await?;
    Ok(Json(rows))
}

pub async fn upload(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Path(expense_id): Path<Uuid>,
    mut multipart: Multipart,
) -> ApiResult<Json<Receipt>> {
    let expense: Expense = sqlx::query_as("SELECT * FROM expenses WHERE id = $1")
        .bind(expense_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or(ApiError::NotFound)?;
    if expense.user_id != claims.sub && claims.role != UserRole::Admin {
        return Err(ApiError::Forbidden);
    }

    let field = multipart
        .next_field()
        .await?
        .ok_or_else(|| ApiError::BadRequest("file field missing".into()))?;
    let file_name = field
        .file_name()
        .map(|s| s.to_string())
        .unwrap_or_else(|| "upload.bin".to_string());
    let content_type = field
        .content_type()
        .map(|s| s.to_string())
        .unwrap_or_else(|| "application/octet-stream".to_string());
    let bytes = field.bytes().await?;
    let byte_size = bytes.len() as i64;
    if byte_size > 10 * 1024 * 1024 {
        return Err(ApiError::BadRequest("file too large (max 10MB)".into()));
    }

    let storage_key = format!("{}/{}", expense_id, Uuid::new_v4());
    let path: PathBuf = PathBuf::from(&state.config.upload_dir).join(&storage_key);
    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }
    let mut f = tokio::fs::File::create(&path).await?;
    f.write_all(&bytes).await?;
    f.flush().await?;

    let receipt: Receipt = sqlx::query_as(
        "INSERT INTO receipts (expense_id, file_name, content_type, byte_size, storage_key)
         VALUES ($1, $2, $3, $4, $5) RETURNING *",
    )
    .bind(expense_id)
    .bind(&file_name)
    .bind(&content_type)
    .bind(byte_size)
    .bind(&storage_key)
    .fetch_one(&state.db)
    .await?;
    Ok(Json(receipt))
}

pub async fn download(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<Response> {
    let receipt: Receipt = sqlx::query_as("SELECT * FROM receipts WHERE id = $1")
        .bind(id)
        .fetch_optional(&state.db)
        .await?
        .ok_or(ApiError::NotFound)?;
    let expense: Expense = sqlx::query_as("SELECT * FROM expenses WHERE id = $1")
        .bind(receipt.expense_id)
        .fetch_one(&state.db)
        .await?;
    let can_view = expense.user_id == claims.sub
        || claims.role == UserRole::Admin
        || claims.role == UserRole::Approver;
    if !can_view {
        return Err(ApiError::Forbidden);
    }
    let path = PathBuf::from(&state.config.upload_dir).join(&receipt.storage_key);
    let file = tokio::fs::File::open(&path).await?;
    let stream = ReaderStream::new(file);
    let body = Body::from_stream(stream);
    let resp = Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, receipt.content_type)
        .header(
            header::CONTENT_DISPOSITION,
            format!("inline; filename=\"{}\"", receipt.file_name),
        )
        .body(body)
        .map_err(|e| ApiError::Internal(anyhow::anyhow!(e)))?;
    Ok(resp.into_response())
}

pub async fn delete(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<serde_json::Value>> {
    let receipt: Receipt = sqlx::query_as("SELECT * FROM receipts WHERE id = $1")
        .bind(id)
        .fetch_optional(&state.db)
        .await?
        .ok_or(ApiError::NotFound)?;
    let expense: Expense = sqlx::query_as("SELECT * FROM expenses WHERE id = $1")
        .bind(receipt.expense_id)
        .fetch_one(&state.db)
        .await?;
    if expense.user_id != claims.sub && claims.role != UserRole::Admin {
        return Err(ApiError::Forbidden);
    }
    let path = PathBuf::from(&state.config.upload_dir).join(&receipt.storage_key);
    tokio::fs::remove_file(&path).await.ok();
    sqlx::query("DELETE FROM receipts WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;
    Ok(Json(serde_json::json!({"deleted": id})))
}
