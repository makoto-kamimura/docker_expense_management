use axum::{
    extract::{Path, State},
    Json,
};
use sqlx::{PgConnection, PgPool};
use uuid::Uuid;

use crate::{
    auth::AuthUser,
    error::{ApiError, ApiResult},
    models::{RequestKind, RequestType, RequestTypeInput, RequestTypeOrder},
    state::AppState,
};

/// 1 つのグループで作れる種類の数
const MAX_TYPES: i64 = 30;
/// 種類の名前の最大文字数
const MAX_NAME: usize = 20;
/// アイコン (絵文字) の最大文字数。肌の色や結合文字を含む絵文字があるので少し余裕を持たせる
const MAX_ICON: usize = 8;

/// グループを作ったときに用意する種類 (名前, アイコン, 型)。型ごとに 1 つずつ
pub const DEFAULT_TYPES: &[(&str, &str, RequestKind)] = &[
    ("購入", "🛍", RequestKind::Purchase),
    ("外出・イベント", "📍", RequestKind::Outing),
    ("提案", "✨", RequestKind::Activity),
];

/// まだ初期の種類を入れていないグループに入れる。families.types_seeded で一度きりにするので、
/// 管理者が種類を消しても、起動し直したときに復活しない。
pub async fn create_defaults(conn: &mut PgConnection, family_id: Uuid) -> ApiResult<()> {
    let seeded = sqlx::query("UPDATE families SET types_seeded = TRUE WHERE id = $1 AND NOT types_seeded")
        .bind(family_id)
        .execute(&mut *conn)
        .await?;
    if seeded.rows_affected() == 0 {
        return Ok(());
    }
    for (position, (name, icon, base)) in DEFAULT_TYPES.iter().enumerate() {
        sqlx::query(
            "INSERT INTO request_types (family_id, name, icon, base, position) VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT DO NOTHING",
        )
        .bind(family_id)
        .bind(name)
        .bind(icon)
        .bind(base)
        .bind(position as i32)
        .execute(&mut *conn)
        .await?;
    }
    Ok(())
}

/// すべてのグループに初期の種類を入れ、種類が付いていない稟議に「同じ型の最初の種類」を付ける。
/// 起動時 (マイグレーションと seed の後) に呼ぶ。何度呼んでも同じ結果になる。
pub async fn ensure_all(db: &PgPool) -> anyhow::Result<()> {
    let families: Vec<(Uuid,)> = sqlx::query_as("SELECT id FROM families WHERE NOT types_seeded")
        .fetch_all(db)
        .await?;
    for (id,) in families {
        let mut conn = db.acquire().await?;
        create_defaults(&mut conn, id).await?;
    }
    sqlx::query(
        "UPDATE purchase_requests r SET type_id = (
             SELECT t.id FROM request_types t
              WHERE t.family_id = r.family_id AND t.base = r.kind
              ORDER BY t.hidden, t.position, t.created_at LIMIT 1)
          WHERE r.type_id IS NULL",
    )
    .execute(db)
    .await?;
    Ok(())
}

/// 稟議に付ける種類を決めて (種類の ID, 型) を返す。
/// type_id があればそのグループの種類か確かめる (非表示の種類は、もともと付いていたときだけ選べる)。
/// なければ、今の種類が同じ型ならそのまま、違えば型の最初の表示中の種類にする。
pub async fn resolve(
    db: &PgPool,
    family_id: Uuid,
    type_id: Option<Uuid>,
    kind: RequestKind,
    current: Option<Uuid>,
) -> ApiResult<(Uuid, RequestKind)> {
    if let Some(id) = type_id {
        let row: Option<(RequestKind, bool)> =
            sqlx::query_as("SELECT base, hidden FROM request_types WHERE id = $1 AND family_id = $2")
                .bind(id)
                .bind(family_id)
                .fetch_optional(db)
                .await?;
        let (base, hidden) =
            row.ok_or_else(|| ApiError::BadRequest("種類が見つかりません。画面を読み込み直してください".into()))?;
        if hidden && current != Some(id) {
            return Err(ApiError::BadRequest("非表示の種類は選べません".into()));
        }
        return Ok((id, base));
    }
    if let Some(cur) = current {
        let same: Option<(Uuid,)> = sqlx::query_as("SELECT id FROM request_types WHERE id = $1 AND base = $2")
            .bind(cur)
            .bind(kind)
            .fetch_optional(db)
            .await?;
        if same.is_some() {
            return Ok((cur, kind));
        }
    }
    let first: Option<(Uuid,)> = sqlx::query_as(
        "SELECT id FROM request_types WHERE family_id = $1 AND base = $2 AND NOT hidden
          ORDER BY position, created_at LIMIT 1",
    )
    .bind(family_id)
    .bind(kind)
    .fetch_optional(db)
    .await?;
    let (id,) = first.ok_or_else(|| ApiError::BadRequest("この型の種類がありません。設定画面で種類を作ってください".into()))?;
    Ok((id, kind))
}

/// 種類の名前 (変更履歴の表示用)
pub async fn name_of(db: &PgPool, id: Option<Uuid>) -> ApiResult<Option<String>> {
    let Some(id) = id else { return Ok(None) };
    let row: Option<(String,)> = sqlx::query_as("SELECT name FROM request_types WHERE id = $1")
        .bind(id)
        .fetch_optional(db)
        .await?;
    Ok(row.map(|r| r.0))
}

async fn family_types(state: &AppState, family_id: Uuid) -> ApiResult<Vec<RequestType>> {
    Ok(sqlx::query_as(
        "SELECT t.id, t.name, t.icon, t.base, t.hidden,
                (SELECT COUNT(*) FROM purchase_requests r WHERE r.type_id = t.id) AS request_count
           FROM request_types t WHERE t.family_id = $1 ORDER BY t.position, t.created_at",
    )
    .bind(family_id)
    .fetch_all(&state.db)
    .await?)
}

/// 入力をそろえて (名前, アイコン) を返す
fn validate(input: &RequestTypeInput) -> ApiResult<(String, String)> {
    let name = input.name.trim();
    if name.is_empty() || name.chars().count() > MAX_NAME {
        return Err(ApiError::BadRequest(format!("種類の名前を{MAX_NAME}文字以内で入力してください")));
    }
    let icon = input.icon.as_deref().map(str::trim).filter(|s| !s.is_empty()).unwrap_or("📝");
    if icon.chars().count() > MAX_ICON {
        return Err(ApiError::BadRequest("アイコンは絵文字1つにしてください".into()));
    }
    Ok((name.to_string(), icon.to_string()))
}

/// 同じグループで同じ名前 (大文字小文字は区別しない) の種類は作れない
fn duplicate_name(e: sqlx::Error) -> ApiError {
    match &e {
        sqlx::Error::Database(db) if db.code().as_deref() == Some("23505") => {
            ApiError::Conflict("同じ名前の種類がすでにあります".into())
        }
        _ => e.into(),
    }
}

/// 表示中の種類が 1 つもなくなる変更は断る (稟議を作れなくなるため)
async fn ensure_visible_left(state: &AppState, family_id: Uuid, except: Uuid) -> ApiResult<()> {
    let (visible,): (i64,) =
        sqlx::query_as("SELECT COUNT(*) FROM request_types WHERE family_id = $1 AND NOT hidden AND id <> $2")
            .bind(family_id)
            .bind(except)
            .fetch_one(&state.db)
            .await?;
    if visible == 0 {
        return Err(ApiError::BadRequest("表示中の種類を1つ以上残してください".into()));
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// 種類の管理 (一覧はメンバー全員、作成・変更・並び替え・削除は管理者)
// ---------------------------------------------------------------------------

pub async fn list(State(state): State<AppState>, AuthUser(me): AuthUser) -> ApiResult<Json<Vec<RequestType>>> {
    Ok(Json(family_types(&state, me.family_id).await?))
}

pub async fn create(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(input): Json<RequestTypeInput>,
) -> ApiResult<Json<Vec<RequestType>>> {
    auth.require_admin()?;
    let me = &auth.0;
    let (name, icon) = validate(&input)?;
    let base = input.base.ok_or_else(|| ApiError::BadRequest("種類の型を選んでください".into()))?;
    let (count,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM request_types WHERE family_id = $1")
        .bind(me.family_id)
        .fetch_one(&state.db)
        .await?;
    if count >= MAX_TYPES {
        return Err(ApiError::BadRequest(format!("種類は{MAX_TYPES}個までです")));
    }
    sqlx::query(
        "INSERT INTO request_types (family_id, name, icon, base, position)
         VALUES ($1, $2, $3, $4, (SELECT COALESCE(MAX(position) + 1, 0) FROM request_types WHERE family_id = $1))",
    )
    .bind(me.family_id)
    .bind(name)
    .bind(icon)
    .bind(base)
    .execute(&state.db)
    .await
    .map_err(duplicate_name)?;
    Ok(Json(family_types(&state, me.family_id).await?))
}

/// 名前・アイコン・非表示を変える (型は変えられない)
pub async fn update(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
    Json(input): Json<RequestTypeInput>,
) -> ApiResult<Json<Vec<RequestType>>> {
    auth.require_admin()?;
    let me = &auth.0;
    let (name, icon) = validate(&input)?;
    if input.hidden {
        ensure_visible_left(&state, me.family_id, id).await?;
    }
    let res = sqlx::query("UPDATE request_types SET name = $1, icon = $2, hidden = $3 WHERE id = $4 AND family_id = $5")
        .bind(name)
        .bind(icon)
        .bind(input.hidden)
        .bind(id)
        .bind(me.family_id)
        .execute(&state.db)
        .await
        .map_err(duplicate_name)?;
    if res.rows_affected() == 0 {
        return Err(ApiError::NotFound);
    }
    Ok(Json(family_types(&state, me.family_id).await?))
}

/// 並び替え。グループの種類 (非表示を含む) の ID を表示順にすべて送る
pub async fn reorder(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(input): Json<RequestTypeOrder>,
) -> ApiResult<Json<Vec<RequestType>>> {
    auth.require_admin()?;
    let me = &auth.0;
    let current: Vec<(Uuid,)> = sqlx::query_as("SELECT id FROM request_types WHERE family_id = $1")
        .bind(me.family_id)
        .fetch_all(&state.db)
        .await?;
    // 途中で種類が追加・削除されていたら、古い画面の順番で上書きしないよう受け付けない
    let mut want: Vec<Uuid> = input.ids.clone();
    let mut have: Vec<Uuid> = current.into_iter().map(|r| r.0).collect();
    want.sort();
    have.sort();
    if want != have {
        return Err(ApiError::Conflict("種類が変わっています。画面を読み込み直してください".into()));
    }
    let positions: Vec<i32> = (0..input.ids.len() as i32).collect();
    sqlx::query(
        "UPDATE request_types t SET position = o.position
           FROM UNNEST($1::uuid[], $2::int[]) AS o(id, position)
          WHERE t.id = o.id AND t.family_id = $3",
    )
    .bind(&input.ids)
    .bind(&positions)
    .bind(me.family_id)
    .execute(&state.db)
    .await?;
    Ok(Json(family_types(&state, me.family_id).await?))
}

/// 削除。その種類の稟議がないときだけ (あれば非表示にしてもらう)
pub async fn delete(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<Vec<RequestType>>> {
    auth.require_admin()?;
    let me = &auth.0;
    let (used,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM purchase_requests WHERE type_id = $1")
        .bind(id)
        .fetch_one(&state.db)
        .await?;
    if used > 0 {
        return Err(ApiError::Conflict(format!(
            "この種類の稟議が{used}件あるので削除できません。使わない場合は非表示にしてください"
        )));
    }
    ensure_visible_left(&state, me.family_id, id).await?;
    let res = sqlx::query("DELETE FROM request_types WHERE id = $1 AND family_id = $2")
        .bind(id)
        .bind(me.family_id)
        .execute(&state.db)
        .await?;
    if res.rows_affected() == 0 {
        return Err(ApiError::NotFound);
    }
    Ok(Json(family_types(&state, me.family_id).await?))
}
