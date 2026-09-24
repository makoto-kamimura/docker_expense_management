use axum::{
    extract::{Path, State},
    Json,
};
use serde_json::json;
use sqlx::PgConnection;
use std::collections::BTreeSet;
use uuid::Uuid;

use crate::{
    auth::AuthUser,
    error::{ApiError, ApiResult},
    handlers::requests::{detail_json, load_request, log_activity, permissions, reviewers_of},
    models::{Label, LabelInput, RequestDetail, RequestLabelsInput, RequestStatus},
    state::AppState,
};

const MAX_NAME: usize = 30;
const MAX_DESCRIPTION: usize = 100;
const MAX_LABELS: i64 = 50;
/// 1 つの稟議に付けられるラベルの数
const MAX_LABELS_PER_REQUEST: usize = 20;

/// 家族を作ったときに用意するラベル (名前, 色, 説明)
const DEFAULT_LABELS: &[(&str, &str, &str)] = &[
    ("急ぎ", "#d1242f", "早めに決めたい"),
    ("誕生日・記念日", "#bf3989", "プレゼントやお祝い"),
    ("セール待ち", "#bf8700", "安くなったら買いたい"),
    ("相談したい", "#0969da", "家族会議で話したい"),
    ("定期", "#1a7f37", "毎月・毎年かかるもの"),
];

/// 以前のカテゴリ (purchase_requests.category) から作るラベル (カテゴリ, 名前, 色)。
/// 「その他」はラベルが付いていないのと同じ意味なので作らない。
const CATEGORY_LABELS: &[(&str, &str, &str)] = &[
    ("home", "家・生活", "#0e8a16"),
    ("electronics", "家電・ガジェット", "#1d76db"),
    ("hobby", "趣味", "#a2eeef"),
    ("travel", "旅行", "#fbca04"),
    ("education", "教育", "#5319e7"),
    ("leisure", "レジャー", "#c2e0c6"),
    ("dining", "外食", "#d93f0b"),
];

/// まだ初期ラベルを入れていない家族に入れる。families.labels_seeded で一度きりにするので、
/// 管理者がラベルをすべて消しても、起動し直したときに復活しない。
pub async fn create_defaults(conn: &mut PgConnection, family_id: Uuid) -> ApiResult<()> {
    migrate_categories(conn, family_id).await?;
    let seeded = sqlx::query("UPDATE families SET labels_seeded = TRUE WHERE id = $1 AND NOT labels_seeded")
        .bind(family_id)
        .execute(&mut *conn)
        .await?;
    if seeded.rows_affected() == 0 {
        return Ok(());
    }
    for (name, color, description) in DEFAULT_LABELS {
        sqlx::query(
            "INSERT INTO labels (family_id, name, color, description) VALUES ($1, $2, $3, $4)
             ON CONFLICT DO NOTHING",
        )
        .bind(family_id)
        .bind(name)
        .bind(color)
        .bind(description)
        .execute(&mut *conn)
        .await?;
    }
    Ok(())
}

/// カテゴリをラベルに移す (家族ごとに一度だけ。families.category_labels_migrated)。
/// カテゴリの名前のラベルを作り (同じ名前のラベルがあればそれを使う)、そのカテゴリの稟議に付ける。
pub async fn migrate_categories(conn: &mut PgConnection, family_id: Uuid) -> ApiResult<()> {
    let first = sqlx::query(
        "UPDATE families SET category_labels_migrated = TRUE WHERE id = $1 AND NOT category_labels_migrated",
    )
    .bind(family_id)
    .execute(&mut *conn)
    .await?;
    if first.rows_affected() == 0 {
        return Ok(());
    }
    for (category, name, color) in CATEGORY_LABELS {
        let existing: Option<(Uuid,)> =
            sqlx::query_as("SELECT id FROM labels WHERE family_id = $1 AND lower(name) = lower($2)")
                .bind(family_id)
                .bind(name)
                .fetch_optional(&mut *conn)
                .await?;
        let label_id = match existing {
            Some((id,)) => id,
            None => {
                let (id,): (Uuid,) = sqlx::query_as(
                    "INSERT INTO labels (family_id, name, color, description) VALUES ($1, $2, $3, '') RETURNING id",
                )
                .bind(family_id)
                .bind(name)
                .bind(color)
                .fetch_one(&mut *conn)
                .await?;
                id
            }
        };
        sqlx::query(
            "INSERT INTO request_labels (request_id, label_id)
             SELECT id, $3 FROM purchase_requests WHERE family_id = $1 AND category = $2::request_category
             ON CONFLICT DO NOTHING",
        )
        .bind(family_id)
        .bind(category)
        .bind(label_id)
        .execute(&mut *conn)
        .await?;
    }
    Ok(())
}

/// 稟議のラベルを ids の集合に置き換え、(付けたラベル名, 外したラベル名) を返す。
/// 他の家族のラベルが混ざっていたら何もせずエラーにする。
pub async fn replace_labels(
    conn: &mut PgConnection,
    family_id: Uuid,
    request_id: Uuid,
    ids: &[Uuid],
) -> ApiResult<(Vec<String>, Vec<String>)> {
    let ids: Vec<Uuid> = ids.iter().copied().collect::<BTreeSet<_>>().into_iter().collect();
    if ids.len() > MAX_LABELS_PER_REQUEST {
        return Err(ApiError::BadRequest(format!("ラベルは1つの稟議に{MAX_LABELS_PER_REQUEST}個までです")));
    }
    let wanted: Vec<(Uuid, String)> =
        sqlx::query_as("SELECT id, name FROM labels WHERE family_id = $1 AND id = ANY($2) ORDER BY name")
            .bind(family_id)
            .bind(&ids)
            .fetch_all(&mut *conn)
            .await?;
    if wanted.len() != ids.len() {
        return Err(ApiError::BadRequest("ラベルが見つかりません。画面を読み込み直してください".into()));
    }
    let before: Vec<(Uuid, String)> = sqlx::query_as(
        "SELECT l.id, l.name FROM request_labels rl JOIN labels l ON l.id = rl.label_id
          WHERE rl.request_id = $1 ORDER BY l.name",
    )
    .bind(request_id)
    .fetch_all(&mut *conn)
    .await?;
    let added = wanted.iter().filter(|w| !before.iter().any(|b| b.0 == w.0)).map(|w| w.1.clone()).collect();
    let removed = before.iter().filter(|b| !ids.contains(&b.0)).map(|b| b.1.clone()).collect();

    sqlx::query("DELETE FROM request_labels WHERE request_id = $1 AND NOT (label_id = ANY($2))")
        .bind(request_id)
        .bind(&ids)
        .execute(&mut *conn)
        .await?;
    sqlx::query("INSERT INTO request_labels (request_id, label_id) SELECT $1, UNNEST($2::uuid[]) ON CONFLICT DO NOTHING")
        .bind(request_id)
        .bind(&ids)
        .execute(&mut *conn)
        .await?;
    Ok((added, removed))
}

/// 稟議に付いているラベル
pub async fn labels_of(state: &AppState, request_id: Uuid) -> ApiResult<Vec<Label>> {
    Ok(sqlx::query_as(
        "SELECT l.id, l.name, l.color, l.description FROM request_labels rl JOIN labels l ON l.id = rl.label_id
          WHERE rl.request_id = $1 ORDER BY l.name",
    )
    .bind(request_id)
    .fetch_all(&state.db)
    .await?)
}

async fn family_labels(state: &AppState, family_id: Uuid) -> ApiResult<Vec<Label>> {
    Ok(sqlx::query_as("SELECT id, name, color, description FROM labels WHERE family_id = $1 ORDER BY name")
        .bind(family_id)
        .fetch_all(&state.db)
        .await?)
}

/// 入力をそろえて (名前, 色, 説明) を返す。色は画面でそのまま CSS に使うので #rrggbb に限る。
fn validate(input: &LabelInput) -> ApiResult<(String, String, String)> {
    let name = input.name.trim();
    if name.is_empty() || name.chars().count() > MAX_NAME {
        return Err(ApiError::BadRequest(format!("ラベルの名前を{MAX_NAME}文字以内で入力してください")));
    }
    let color = input.color.trim().to_ascii_lowercase();
    let valid_color = color.len() == 7 && color.starts_with('#') && color[1..].chars().all(|c| c.is_ascii_hexdigit());
    if !valid_color {
        return Err(ApiError::BadRequest("色は #rrggbb の形式で指定してください".into()));
    }
    let description = input.description.as_deref().map(str::trim).unwrap_or("");
    if description.chars().count() > MAX_DESCRIPTION {
        return Err(ApiError::BadRequest(format!("ラベルの説明は{MAX_DESCRIPTION}文字以内で入力してください")));
    }
    Ok((name.to_string(), color, description.to_string()))
}

/// 同じ家族で同じ名前 (大文字小文字は区別しない) のラベルは作れない
fn duplicate_name(e: sqlx::Error) -> ApiError {
    match &e {
        sqlx::Error::Database(db) if db.code().as_deref() == Some("23505") => {
            ApiError::Conflict("同じ名前のラベルがすでにあります".into())
        }
        _ => e.into(),
    }
}

// ---------------------------------------------------------------------------
// ラベルの管理 (一覧は家族全員、作成・変更・削除は管理者)
// ---------------------------------------------------------------------------

pub async fn list(State(state): State<AppState>, AuthUser(me): AuthUser) -> ApiResult<Json<Vec<Label>>> {
    Ok(Json(family_labels(&state, me.family_id).await?))
}

pub async fn create(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(input): Json<LabelInput>,
) -> ApiResult<Json<Vec<Label>>> {
    auth.require_admin()?;
    let me = &auth.0;
    let (name, color, description) = validate(&input)?;
    let (count,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM labels WHERE family_id = $1")
        .bind(me.family_id)
        .fetch_one(&state.db)
        .await?;
    if count >= MAX_LABELS {
        return Err(ApiError::BadRequest(format!("ラベルは{MAX_LABELS}個までです")));
    }
    sqlx::query("INSERT INTO labels (family_id, name, color, description) VALUES ($1, $2, $3, $4)")
        .bind(me.family_id)
        .bind(name)
        .bind(color)
        .bind(description)
        .execute(&state.db)
        .await
        .map_err(duplicate_name)?;
    Ok(Json(family_labels(&state, me.family_id).await?))
}

pub async fn update(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
    Json(input): Json<LabelInput>,
) -> ApiResult<Json<Vec<Label>>> {
    auth.require_admin()?;
    let me = &auth.0;
    let (name, color, description) = validate(&input)?;
    let res = sqlx::query("UPDATE labels SET name = $1, color = $2, description = $3 WHERE id = $4 AND family_id = $5")
        .bind(name)
        .bind(color)
        .bind(description)
        .bind(id)
        .bind(me.family_id)
        .execute(&state.db)
        .await
        .map_err(duplicate_name)?;
    if res.rows_affected() == 0 {
        return Err(ApiError::NotFound);
    }
    Ok(Json(family_labels(&state, me.family_id).await?))
}

/// 削除すると、付いていた稟議からも外れる
pub async fn delete(State(state): State<AppState>, auth: AuthUser, Path(id): Path<Uuid>) -> ApiResult<Json<Vec<Label>>> {
    auth.require_admin()?;
    let me = &auth.0;
    let res = sqlx::query("DELETE FROM labels WHERE id = $1 AND family_id = $2")
        .bind(id)
        .bind(me.family_id)
        .execute(&state.db)
        .await?;
    if res.rows_affected() == 0 {
        return Err(ApiError::NotFound);
    }
    Ok(Json(family_labels(&state, me.family_id).await?))
}

// ---------------------------------------------------------------------------
// 稟議へのラベルの付け外し (申請者とレビュアー。状態は問わない)
// ---------------------------------------------------------------------------

/// 稟議のラベルを、受け取った ID の集合に置き換える。付けた・外したラベルをアクティビティに残す。
pub async fn set_request_labels(
    State(state): State<AppState>,
    AuthUser(me): AuthUser,
    Path(id): Path<Uuid>,
    Json(input): Json<RequestLabelsInput>,
) -> ApiResult<Json<RequestDetail>> {
    let req = load_request(&state, &me, id).await?;
    let reviewers = reviewers_of(&state, id).await?;
    if !permissions(&me, &req, &reviewers).can_label {
        return Err(ApiError::Forbidden);
    }
    let mut tx = state.db.begin().await?;
    let (added, removed) = replace_labels(&mut tx, me.family_id, id, &input.label_ids).await?;
    // 下書き中の変更は記録しない (まだ誰も見ていないため)
    if (!added.is_empty() || !removed.is_empty()) && req.status != RequestStatus::Draft {
        log_activity(&mut *tx, id, me.id, "labeled", json!({ "added": added, "removed": removed })).await?;
    }
    tx.commit().await?;
    detail_json(&state, &me, id).await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn input(name: &str, color: &str) -> LabelInput {
        LabelInput { name: name.into(), color: color.into(), description: None }
    }

    #[test]
    fn color_must_be_hex() {
        assert_eq!(validate(&input(" 急ぎ ", "#D1242F")).unwrap().1, "#d1242f");
        assert!(validate(&input("急ぎ", "red")).is_err());
        assert!(validate(&input("急ぎ", "#12345")).is_err());
        assert!(validate(&input("急ぎ", "#12345g")).is_err());
        // CSS に埋め込むので、;や ) などが混ざった値は通さない
        assert!(validate(&input("急ぎ", "#fff;x:1")).is_err());
    }

    #[test]
    fn name_is_required() {
        assert!(validate(&input("  ", "#000000")).is_err());
        assert!(validate(&input(&"あ".repeat(31), "#000000")).is_err());
    }
}
