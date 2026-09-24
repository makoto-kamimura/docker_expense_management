use std::path::PathBuf;

use axum::{
    body::Body,
    extract::{Path, State},
    http::{header, StatusCode},
    response::{IntoResponse, Response},
};
use tokio_util::io::ReaderStream;
use uuid::Uuid;

use crate::{
    auth::AuthUser,
    error::{ApiError, ApiResult},
    state::AppState,
};

/// プレビュー画像。同じ家族の (他人の下書きを除く) 稟議で使われている URL の画像だけ返す。
pub async fn image(
    State(state): State<AppState>,
    AuthUser(me): AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<Response> {
    let row: Option<(String, String)> = sqlx::query_as(
        "SELECT lp.image_key, lp.image_type FROM link_previews lp
          WHERE lp.id = $1 AND lp.image_key IS NOT NULL
            AND EXISTS (
                SELECT 1 FROM purchase_requests r
                  LEFT JOIN alternative_products a ON a.request_id = r.id
                 WHERE r.family_id = $2
                   AND (r.status <> 'draft' OR r.requester_id = $3)
                   AND lp.url IN (r.product_url, r.final_product_url, a.url))",
    )
    .bind(id)
    .bind(me.family_id)
    .bind(me.id)
    .fetch_optional(&state.db)
    .await?;
    let (key, content_type) = row.ok_or(ApiError::NotFound)?;
    let file = tokio::fs::File::open(PathBuf::from(&state.config.upload_dir).join(key)).await?;
    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, content_type)
        .header(header::X_CONTENT_TYPE_OPTIONS, "nosniff")
        .header(header::CACHE_CONTROL, "private, max-age=86400")
        .body(Body::from_stream(ReaderStream::new(file)))
        .map(IntoResponse::into_response)
        .map_err(|e| ApiError::Internal(anyhow::anyhow!(e)))
}
