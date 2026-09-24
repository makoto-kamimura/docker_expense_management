use std::path::PathBuf;

use axum::{
    body::Body,
    extract::{Multipart, Path, Query, State},
    http::{header, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use chrono::{Duration, Utc};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use serde_json::json;
use tokio::io::AsyncWriteExt;
use tokio_util::io::ReaderStream;
use uuid::Uuid;

use crate::{
    auth::AuthUser,
    error::{ApiError, ApiResult},
    handlers::requests::{load_request, log_activity, permissions, reviewers_of},
    models::{Attachment, AttachmentKind, Member, RequestStatus},
    state::AppState,
};

pub const MAX_BYTES: usize = 10 * 1024 * 1024;
/// アップロードを受けるルートのリクエスト本体の上限 (ファイル + multipart の区切りなど)。
/// axum の既定 (2MB) のままだと MAX_BYTES まで受け取れないため、ルートごとに広げる。
pub const UPLOAD_BODY_LIMIT: usize = MAX_BYTES + 1024 * 1024;
/// 署名付きリンクの有効期間。モバイルで PDF を外部ビューアに渡すためだけに使う。
const LINK_TTL_SECS: i64 = 300;

/// 画面にインライン表示するので、画像 (SVG を除く) と PDF 以外は受け付けない
fn is_allowed_content_type(ct: &str) -> bool {
    let ct = ct.to_ascii_lowercase();
    ct == "application/pdf" || (ct.starts_with("image/") && !ct.contains("svg"))
}

/// ブラウザによっては HEIC の Content-Type が空になるので拡張子から補う
pub fn resolve_content_type(declared: Option<&str>, file_name: &str) -> String {
    let lower = file_name.to_ascii_lowercase();
    match declared {
        Some(ct) if !ct.is_empty() && ct != "application/octet-stream" => ct.to_string(),
        _ if lower.ends_with(".heic") => "image/heic".into(),
        _ if lower.ends_with(".heif") => "image/heif".into(),
        _ if lower.ends_with(".pdf") => "application/pdf".into(),
        _ if lower.ends_with(".webp") => "image/webp".into(),
        _ if lower.ends_with(".png") => "image/png".into(),
        _ if lower.ends_with(".jpg") || lower.ends_with(".jpeg") => "image/jpeg".into(),
        _ => "application/octet-stream".into(),
    }
}

#[derive(Debug, Deserialize)]
pub struct UploadQuery {
    kind: Option<AttachmentKind>,
}

pub async fn upload(
    State(state): State<AppState>,
    AuthUser(me): AuthUser,
    Path(request_id): Path<Uuid>,
    Query(q): Query<UploadQuery>,
    mut multipart: Multipart,
) -> ApiResult<Json<Attachment>> {
    let kind = q.kind.unwrap_or(AttachmentKind::Evidence);
    let req = load_request(&state, &me, request_id).await?;
    let reviewers = reviewers_of(&state, request_id).await?;
    let perms = permissions(&me, &req, &reviewers);
    let allowed = match kind {
        AttachmentKind::Evidence => perms.can_upload_evidence,
        AttachmentKind::Receipt => perms.can_upload_receipt,
    };
    if !allowed {
        return Err(if req.requester_id == me.id {
            ApiError::Conflict("今の状態ではこの種類のファイルは添付できません".into())
        } else {
            ApiError::Forbidden
        });
    }

    let field = multipart
        .next_field()
        .await?
        .ok_or_else(|| ApiError::BadRequest("file field missing".into()))?;
    let file_name = field
        .file_name()
        .map(|s| s.to_string())
        .unwrap_or_else(|| "upload.bin".to_string());
    let content_type = resolve_content_type(field.content_type(), &file_name);
    if !is_allowed_content_type(&content_type) {
        return Err(ApiError::BadRequest("画像 (JPG・PNG・WEBP・HEIC) または PDF を添付してください".into()));
    }
    let bytes = field.bytes().await?;
    if bytes.len() > MAX_BYTES {
        return Err(ApiError::BadRequest("ファイルが大きすぎます (最大10MB)".into()));
    }

    let storage_key = format!("{}/{}", request_id, Uuid::new_v4());
    let path: PathBuf = PathBuf::from(&state.config.upload_dir).join(&storage_key);
    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }
    let mut f = tokio::fs::File::create(&path).await?;
    f.write_all(&bytes).await?;
    f.flush().await?;

    let mut tx = state.db.begin().await?;
    let attachment: Attachment = sqlx::query_as(
        "INSERT INTO attachments (request_id, kind, file_name, content_type, byte_size, storage_key, uploaded_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *",
    )
    .bind(request_id)
    .bind(kind)
    .bind(&file_name)
    .bind(&content_type)
    .bind(bytes.len() as i64)
    .bind(&storage_key)
    .bind(me.id)
    .fetch_one(&mut *tx)
    .await?;
    // Draft 中の添付は履歴に残さない
    if req.status != RequestStatus::Draft {
        log_activity(&mut *tx, request_id, me.id, "attachment_added", json!({ "file_name": file_name, "kind": kind }))
            .await?;
    }
    tx.commit().await?;
    Ok(Json(attachment))
}

/// 同じ家族で閲覧できる申請の添付を取得する
async fn load_viewable(state: &AppState, me: &Member, id: Uuid) -> ApiResult<Attachment> {
    let a: Attachment = sqlx::query_as("SELECT * FROM attachments WHERE id = $1")
        .bind(id)
        .fetch_optional(&state.db)
        .await?
        .ok_or(ApiError::NotFound)?;
    load_request(state, me, a.request_id).await?;
    Ok(a)
}

async fn stream(state: &AppState, a: Attachment) -> ApiResult<Response> {
    serve_file(state, &a.storage_key, &a.file_name, a.content_type).await
}

/// UPLOAD_DIR 配下のファイルをインライン表示用に返す (添付・家事の見本画像で共通)
pub async fn serve_file(state: &AppState, storage_key: &str, file_name: &str, content_type: String) -> ApiResult<Response> {
    let path = PathBuf::from(&state.config.upload_dir).join(storage_key);
    let file = tokio::fs::File::open(&path).await?;
    let body = Body::from_stream(ReaderStream::new(file));
    // ヘッダ注入を避けるため、ファイル名の引用符・制御文字は置き換える
    let safe_name: String = file_name
        .chars()
        .map(|c| if c == '"' || c == '\\' || c.is_control() { '_' } else { c })
        .collect();
    let content_type = if is_allowed_content_type(&content_type) {
        content_type
    } else {
        "application/octet-stream".to_string()
    };
    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, content_type)
        .header(header::X_CONTENT_TYPE_OPTIONS, "nosniff")
        .header(header::CONTENT_DISPOSITION, format!("inline; filename=\"{safe_name}\""))
        .body(body)
        .map(IntoResponse::into_response)
        .map_err(|e| ApiError::Internal(anyhow::anyhow!(e)))
}

pub async fn download(
    State(state): State<AppState>,
    AuthUser(me): AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<Response> {
    let a = load_viewable(&state, &me, id).await?;
    stream(&state, a).await
}

pub async fn delete(
    State(state): State<AppState>,
    AuthUser(me): AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<serde_json::Value>> {
    let a = load_viewable(&state, &me, id).await?;
    let req = load_request(&state, &me, a.request_id).await?;
    if req.requester_id != me.id {
        return Err(ApiError::Forbidden);
    }
    if req.status == RequestStatus::Closed {
        return Err(ApiError::Conflict("クローズした申請は変更できません".into()));
    }
    let mut tx = state.db.begin().await?;
    sqlx::query("DELETE FROM attachments WHERE id = $1")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    if req.status != RequestStatus::Draft {
        log_activity(&mut *tx, req.id, me.id, "attachment_removed", json!({ "file_name": a.file_name })).await?;
    }
    tx.commit().await?;
    tokio::fs::remove_file(PathBuf::from(&state.config.upload_dir).join(&a.storage_key))
        .await
        .ok();
    Ok(Json(json!({ "deleted": id })))
}

#[derive(Debug, Serialize, Deserialize)]
struct LinkClaims {
    /// 対象の添付 ID。ログイン用トークンとは項目が異なるので相互に流用できない。
    aid: Uuid,
    exp: i64,
}

#[derive(Debug, Serialize)]
pub struct LinkResp {
    /// API ベース URL からの相対パス
    pub path: String,
    pub expires_in: i64,
}

/// Authorization ヘッダを付けられない外部ビューア向けに、短時間だけ有効な URL を発行する
pub async fn link(
    State(state): State<AppState>,
    AuthUser(me): AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<LinkResp>> {
    let a = load_viewable(&state, &me, id).await?;
    let claims = LinkClaims {
        aid: a.id,
        exp: (Utc::now() + Duration::seconds(LINK_TTL_SECS)).timestamp(),
    };
    let sig = encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(state.config.jwt_secret.as_bytes()),
    )?;
    Ok(Json(LinkResp {
        path: format!("/attachments/{}/raw?sig={}", a.id, sig),
        expires_in: LINK_TTL_SECS,
    }))
}

#[derive(Debug, Deserialize)]
pub struct RawQuery {
    sig: String,
}

pub async fn raw(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Query(q): Query<RawQuery>,
) -> ApiResult<Response> {
    let data = decode::<LinkClaims>(
        &q.sig,
        &DecodingKey::from_secret(state.config.jwt_secret.as_bytes()),
        &Validation::default(),
    )
    .map_err(|_| ApiError::Unauthorized)?;
    if data.claims.aid != id {
        return Err(ApiError::Unauthorized);
    }
    let a: Attachment = sqlx::query_as("SELECT * FROM attachments WHERE id = $1")
        .bind(id)
        .fetch_optional(&state.db)
        .await?
        .ok_or(ApiError::NotFound)?;
    stream(&state, a).await
}
