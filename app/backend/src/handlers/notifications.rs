//! 通知: 稟議のボールが自分に来たとき (レビューの依頼・確認の依頼・承認・却下・マージ・担当・返事のお願いなど) に、
//! 相手に知らせる。アプリ内の通知 (ベルと一覧) に残し、購読している端末には Web Push でも送る (crate::push)。

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

/// 通知する出来事。ふつうのコメントは通知せず、返事のお願いと、その返事だけを知らせる
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Notify {
    /// 申請 (→ レビュアー)
    ReviewRequested,
    /// 再確認の依頼のあとの再申請 (→ レビュアー)
    Resubmitted,
    /// 再オープン (→ 申請者・レビュアー・担当者)
    Reopened,
    /// 再確認の依頼 (→ 申請者)
    ChangesRequested,
    /// 承認 (→ 申請者)
    Approved,
    /// 却下 (→ 申請者)
    Rejected,
    /// マージ (→ 申請者・レビュアー・担当者)
    Merged,
    /// 担当者になった (→ 担当者)
    Assigned,
    /// 完了の報告 (購入済み・行ってきた・やった) (→ 申請者・レビュアー)
    Purchased,
    /// コメントでの返事のお願い (→ お願いされた人。notify_users で宛先を指定する)
    ReplyRequested,
    /// 返事のお願いへの返事 (→ お願いした人。notify_users で宛先を指定する)
    Replied,
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
            Self::Assigned => "assigned",
            Self::Purchased => "purchased",
            Self::ReplyRequested => "reply_requested",
            Self::Replied => "replied",
        }
    }
}

/// 稟議の当事者 (通知を受け取る人を決めるのに使う)
pub struct Parties<'a> {
    pub requester_id: Uuid,
    pub reviewer_ids: &'a [Uuid],
    /// 担当者 (いなければ申請者が動く)
    pub assignee_id: Option<Uuid>,
}

/// 通知を受け取る人。操作した本人には送らない。返事のお願いと返事は宛先を指定するので、ここでは誰にも送らない
pub fn recipients(kind: Notify, parties: &Parties, actor_id: Uuid) -> Vec<Uuid> {
    let (to_requester, to_reviewers, to_assignee) = match kind {
        Notify::ReviewRequested | Notify::Resubmitted => (false, true, false),
        Notify::ChangesRequested | Notify::Approved | Notify::Rejected => (true, false, false),
        Notify::Reopened | Notify::Merged => (true, true, true),
        Notify::Assigned => (false, false, true),
        Notify::Purchased => (true, true, false),
        Notify::ReplyRequested | Notify::Replied => (false, false, false),
    };
    let mut ids: Vec<Uuid> = Vec::new();
    if to_requester {
        ids.push(parties.requester_id);
    }
    if to_reviewers {
        ids.extend_from_slice(parties.reviewer_ids);
    }
    if to_assignee {
        ids.extend(parties.assignee_id);
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
        "assigned" => format!("{who} があなたを担当者にしました"),
        "purchased" => format!("{who} が完了を報告しました"),
        "reply_requested" => format!("{who} から返事のお願いがあります"),
        "replied" => format!("{who} から返事がありました"),
        _ => format!("{who} が稟議を更新しました"),
    }
}

/// 稟議の操作と同じトランザクションで通知を作る。作った通知の ID を返す (コミット後に push::deliver に渡す)
pub async fn notify(
    conn: &mut PgConnection,
    request_id: Uuid,
    actor_id: Uuid,
    kind: Notify,
    parties: &Parties<'_>,
) -> ApiResult<Vec<Uuid>> {
    notify_users(conn, request_id, actor_id, kind, &recipients(kind, parties, actor_id)).await
}

/// 宛先を指定して通知を作る (返事のお願いと返事)。操作した本人には送らない
pub async fn notify_users(
    conn: &mut PgConnection,
    request_id: Uuid,
    actor_id: Uuid,
    kind: Notify,
    to: &[Uuid],
) -> ApiResult<Vec<Uuid>> {
    let mut to: Vec<Uuid> = to.iter().copied().filter(|id| *id != actor_id).collect();
    to.sort();
    to.dedup();
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

    fn parties(requester_id: Uuid, reviewer_ids: &[Uuid], assignee_id: Option<Uuid>) -> Parties<'_> {
        Parties { requester_id, reviewer_ids, assignee_id }
    }

    fn sorted(mut ids: Vec<Uuid>) -> Vec<Uuid> {
        ids.sort();
        ids
    }

    #[test]
    fn review_requests_go_to_reviewers() {
        let (requester, a, b) = (Uuid::new_v4(), Uuid::new_v4(), Uuid::new_v4());
        let reviewers = [a, b];
        let p = parties(requester, &reviewers, Some(Uuid::new_v4()));
        assert_eq!(recipients(Notify::ReviewRequested, &p, requester), sorted(vec![a, b]));
        assert_eq!(recipients(Notify::Resubmitted, &p, requester), sorted(vec![a, b]));
    }

    #[test]
    fn decisions_go_to_requester() {
        let (requester, a) = (Uuid::new_v4(), Uuid::new_v4());
        let reviewers = [a];
        let p = parties(requester, &reviewers, Some(Uuid::new_v4()));
        for kind in [Notify::ChangesRequested, Notify::Approved, Notify::Rejected] {
            assert_eq!(recipients(kind, &p, a), vec![requester], "{kind:?}");
        }
    }

    #[test]
    fn merge_and_reopen_go_to_everyone_but_the_actor() {
        let (requester, a, b, assignee) = (Uuid::new_v4(), Uuid::new_v4(), Uuid::new_v4(), Uuid::new_v4());
        for kind in [Notify::Merged, Notify::Reopened] {
            assert_eq!(recipients(kind, &parties(requester, &[a, b], None), a), sorted(vec![requester, b]), "{kind:?}");
            // 担当者がいれば、担当者にも知らせる (マージされたら担当者の番になる)
            assert_eq!(
                recipients(kind, &parties(requester, &[a, b], Some(assignee)), a),
                sorted(vec![requester, b, assignee]),
                "{kind:?}"
            );
        }
    }

    #[test]
    fn assignment_goes_to_the_assignee_only() {
        let (requester, a, assignee) = (Uuid::new_v4(), Uuid::new_v4(), Uuid::new_v4());
        assert_eq!(recipients(Notify::Assigned, &parties(requester, &[a], Some(assignee)), a), vec![assignee]);
        // 自分を担当者にしたときは送らない
        assert!(recipients(Notify::Assigned, &parties(requester, &[a], Some(a)), a).is_empty());
    }

    #[test]
    fn completion_goes_to_requester_and_reviewers() {
        let (requester, a, assignee) = (Uuid::new_v4(), Uuid::new_v4(), Uuid::new_v4());
        let reviewers = [a];
        let p = parties(requester, &reviewers, Some(assignee));
        assert_eq!(recipients(Notify::Purchased, &p, assignee), sorted(vec![requester, a]));
    }

    #[test]
    fn replies_are_sent_only_to_named_users() {
        let (requester, a) = (Uuid::new_v4(), Uuid::new_v4());
        let reviewers = [a];
        let p = parties(requester, &reviewers, None);
        for kind in [Notify::ReplyRequested, Notify::Replied] {
            assert!(recipients(kind, &p, a).is_empty(), "{kind:?}");
        }
    }

    #[test]
    fn message_names_the_actor() {
        assert_eq!(message("changes_requested", Some("ママ")), "ママ から確認の依頼があります");
        assert_eq!(message("approved", None), "メンバー が承認しました");
        assert_eq!(message("assigned", Some("ママ")), "ママ があなたを担当者にしました");
        assert_eq!(message("reply_requested", Some("パパ")), "パパ から返事のお願いがあります");
        assert_eq!(message("replied", Some("子ども")), "子ども から返事がありました");
    }
}
