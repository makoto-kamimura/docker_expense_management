//! 通知: 稟議のボールが自分に来たとき (レビューの依頼・確認の依頼・承認・却下・マージ) に、相手に知らせる。
//! アプリ内の通知 (ベルと一覧) に残し、購読している端末には Web Push でも送る (crate::push)。

use axum::{
    extract::{Path, State},
    Json,
};
use serde_json::{json, Value};
use sqlx::PgConnection;
use uuid::Uuid;

use crate::{
    auth::AuthUser,
    error::{ApiError, ApiResult},
    models::{NotificationItem, NotificationList, PushSubscriptionInput, PushUnsubscribeInput},
    push,
    state::AppState,
};

/// 一覧に出す件数
const LIST_LIMIT: i64 = 50;

/// 通知する出来事。コメントは通知しない
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Notify {
    /// 申請 (→ レビュアー)
    ReviewRequested,
    /// 再確認の依頼のあとの再申請 (→ レビュアー)
    Resubmitted,
    /// 再オープン (→ 申請者とレビュアー)
    Reopened,
    /// 再確認の依頼 (→ 申請者)
    ChangesRequested,
    /// 承認 (→ 申請者)
    Approved,
    /// 却下 (→ 申請者)
    Rejected,
    /// マージ (→ 申請者とレビュアー)
    Merged,
}

impl Notify {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::ReviewRequested => "review_requested",
            Self::Resubmitted => "resubmitted",
            Self::Reopened => "reopened",
            Self::ChangesRequested => "changes_requested",
            Self::Approved => "approved",
            Self::Rejected => "rejected",
            Self::Merged => "merged",
        }
    }
}

/// 通知を受け取る人。操作した本人には送らない
pub fn recipients(kind: Notify, requester_id: Uuid, reviewer_ids: &[Uuid], actor_id: Uuid) -> Vec<Uuid> {
    let (to_requester, to_reviewers) = match kind {
        Notify::ReviewRequested | Notify::Resubmitted => (false, true),
        Notify::ChangesRequested | Notify::Approved | Notify::Rejected => (true, false),
        Notify::Reopened | Notify::Merged => (true, true),
    };
    let mut ids: Vec<Uuid> = Vec::new();
    if to_requester {
        ids.push(requester_id);
    }
    if to_reviewers {
        ids.extend_from_slice(reviewer_ids);
    }
    ids.retain(|id| *id != actor_id);
    ids.sort();
    ids.dedup();
    ids
}

/// 通知の文面 (アプリ内の一覧と Web Push で共通)。actor は操作した人の名前 (退会していれば None)
pub fn message(kind: &str, actor: Option<&str>) -> String {
    let who = actor.unwrap_or("メンバー");
    match kind {
        "review_requested" => format!("{who} からレビューの依頼があります"),
        "resubmitted" => format!("{who} が内容を見直して再申請しました"),
        "reopened" => format!("{who} が稟議を再オープンしました"),
        "changes_requested" => format!("{who} から確認の依頼があります"),
        "approved" => format!("{who} が承認しました"),
        "rejected" => format!("{who} が却下しました"),
        "merged" => format!("{who} がマージしました"),
        _ => format!("{who} が稟議を更新しました"),
    }
}

/// 稟議の操作と同じトランザクションで通知を作る。作った通知の ID を返す (コミット後に push::deliver に渡す)
pub async fn notify(
    conn: &mut PgConnection,
    request_id: Uuid,
    actor_id: Uuid,
    kind: Notify,
    requester_id: Uuid,
    reviewer_ids: &[Uuid],
) -> ApiResult<Vec<Uuid>> {
    let to = recipients(kind, requester_id, reviewer_ids, actor_id);
    if to.is_empty() {
        return Ok(Vec::new());
    }
    let rows: Vec<(Uuid,)> = sqlx::query_as(
        "INSERT INTO notifications (user_id, request_id, actor_id, kind)
         SELECT UNNEST($1::uuid[]), $2, $3, $4 RETURNING id",
    )
    .bind(&to)
    .bind(request_id)
    .bind(actor_id)
    .bind(kind.as_str())
    .fetch_all(conn)
    .await?;
    Ok(rows.into_iter().map(|r| r.0).collect())
}

/// 稟議を開いたら、その稟議の自分宛ての通知を既読にする
pub async fn mark_request_read(state: &AppState, user_id: Uuid, request_id: Uuid) -> ApiResult<()> {
    sqlx::query("UPDATE notifications SET read_at = now() WHERE user_id = $1 AND request_id = $2 AND read_at IS NULL")
        .bind(user_id)
        .bind(request_id)
        .execute(&state.db)
        .await?;
    Ok(())
}

async fn unread_count(state: &AppState, user_id: Uuid) -> ApiResult<i64> {
    let (n,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND read_at IS NULL")
        .bind(user_id)
        .fetch_one(&state.db)
        .await?;
    Ok(n)
}

/// 自分宛ての通知 (新しい順に LIST_LIMIT 件) と未読の数
pub async fn list(State(state): State<AppState>, AuthUser(me): AuthUser) -> ApiResult<Json<NotificationList>> {
    type Row = (Uuid, String, Uuid, String, Option<String>, chrono::DateTime<chrono::Utc>, Option<chrono::DateTime<chrono::Utc>>);
    let rows: Vec<Row> = sqlx::query_as(
        "SELECT n.id, n.kind, n.request_id, r.title, u.name, n.created_at, n.read_at
           FROM notifications n
           JOIN purchase_requests r ON r.id = n.request_id AND r.family_id = $2
           LEFT JOIN users u ON u.id = n.actor_id
          WHERE n.user_id = $1
          ORDER BY n.created_at DESC
          LIMIT $3",
    )
    .bind(me.id)
    .bind(me.family_id)
    .bind(LIST_LIMIT)
    .fetch_all(&state.db)
    .await?;
    let items = rows
        .into_iter()
        .map(|(id, kind, request_id, request_title, actor_name, created_at, read_at)| NotificationItem {
            message: message(&kind, actor_name.as_deref()),
            id,
            kind,
            request_id,
            request_title,
            actor_name,
            created_at,
            read_at,
        })
        .collect();
    Ok(Json(NotificationList { unread: unread_count(&state, me.id).await?, items }))
}

pub async fn unread(State(state): State<AppState>, AuthUser(me): AuthUser) -> ApiResult<Json<Value>> {
    Ok(Json(json!({ "unread": unread_count(&state, me.id).await? })))
}

pub async fn read_one(
    State(state): State<AppState>,
    AuthUser(me): AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<Value>> {
    let done = sqlx::query("UPDATE notifications SET read_at = COALESCE(read_at, now()) WHERE id = $1 AND user_id = $2")
        .bind(id)
        .bind(me.id)
        .execute(&state.db)
        .await?;
    if done.rows_affected() == 0 {
        return Err(ApiError::NotFound);
    }
    Ok(Json(json!({ "unread": unread_count(&state, me.id).await? })))
}

pub async fn read_all(State(state): State<AppState>, AuthUser(me): AuthUser) -> ApiResult<Json<Value>> {
    sqlx::query("UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL")
        .bind(me.id)
        .execute(&state.db)
        .await?;
    Ok(Json(json!({ "unread": 0 })))
}

// ---------------------------------------------------------------------------
// Web Push の購読
// ---------------------------------------------------------------------------

/// ブラウザが購読に使う公開鍵。Web Push を使えないときは null
pub async fn public_key(State(state): State<AppState>, AuthUser(_me): AuthUser) -> ApiResult<Json<Value>> {
    Ok(Json(json!({ "public_key": state.vapid.as_ref().map(|v| v.public_key.clone()) })))
}

/// 購読を登録する。同じ端末 (endpoint) を別の人が登録したら、その人のものにする
pub async fn subscribe(
    State(state): State<AppState>,
    AuthUser(me): AuthUser,
    Json(input): Json<PushSubscriptionInput>,
) -> ApiResult<Json<Value>> {
    let endpoint = input.endpoint.trim();
    if !endpoint.starts_with("https://") || endpoint.len() > 2000 {
        return Err(ApiError::BadRequest("通知の登録先が正しくありません".into()));
    }
    push::validate_keys(&input.keys.p256dh, &input.keys.auth)
        .map_err(|_| ApiError::BadRequest("通知の鍵が正しくありません".into()))?;
    sqlx::query(
        "INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES ($1, $2, $3, $4)
         ON CONFLICT (endpoint) DO UPDATE
            SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth",
    )
    .bind(me.id)
    .bind(endpoint)
    .bind(&input.keys.p256dh)
    .bind(&input.keys.auth)
    .execute(&state.db)
    .await?;
    Ok(Json(json!({ "subscribed": true })))
}

pub async fn unsubscribe(
    State(state): State<AppState>,
    AuthUser(me): AuthUser,
    Json(input): Json<PushUnsubscribeInput>,
) -> ApiResult<Json<Value>> {
    sqlx::query("DELETE FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2")
        .bind(input.endpoint.trim())
        .bind(me.id)
        .execute(&state.db)
        .await?;
    Ok(Json(json!({ "subscribed": false })))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn review_requests_go_to_reviewers() {
        let (requester, a, b) = (Uuid::new_v4(), Uuid::new_v4(), Uuid::new_v4());
        let mut both = vec![a, b];
        both.sort();
        assert_eq!(recipients(Notify::ReviewRequested, requester, &[a, b], requester), both);
        assert_eq!(recipients(Notify::Resubmitted, requester, &[a, b], requester), both);
    }

    #[test]
    fn decisions_go_to_requester() {
        let (requester, a) = (Uuid::new_v4(), Uuid::new_v4());
        for kind in [Notify::ChangesRequested, Notify::Approved, Notify::Rejected] {
            assert_eq!(recipients(kind, requester, &[a], a), vec![requester], "{kind:?}");
        }
    }

    #[test]
    fn merge_and_reopen_go_to_everyone_but_the_actor() {
        let (requester, a, b) = (Uuid::new_v4(), Uuid::new_v4(), Uuid::new_v4());
        for kind in [Notify::Merged, Notify::Reopened] {
            let mut want = vec![requester, b];
            want.sort();
            assert_eq!(recipients(kind, requester, &[a, b], a), want, "{kind:?}");
        }
    }

    #[test]
    fn message_names_the_actor() {
        assert_eq!(message("changes_requested", Some("ママ")), "ママ から確認の依頼があります");
        assert_eq!(message("approved", None), "メンバー が承認しました");
    }
}
