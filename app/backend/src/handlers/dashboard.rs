use axum::{extract::State, Json};

use crate::{
    auth::AuthUser,
    error::ApiResult,
    models::{Dashboard, Label, LabelTotal},
    state::AppState,
};

/// 家族の購入状況。Draft は本人以外に見えないので件数から除く。
pub async fn get(State(state): State<AppState>, AuthUser(me): AuthUser) -> ApiResult<Json<Dashboard>> {
    let (currency,): (String,) = sqlx::query_as("SELECT currency FROM families WHERE id = $1")
        .bind(me.family_id)
        .fetch_one(&state.db)
        .await?;
    let (total, waiting, mine, approved, purchased, spending): (i64, i64, i64, i64, i64, i64) = sqlx::query_as(
        "SELECT COUNT(*) FILTER (WHERE status <> 'draft'),
                COUNT(*) FILTER (WHERE status IN ('submitted', 'under_review')),
                COUNT(*) FILTER (WHERE status IN ('submitted', 'under_review') AND EXISTS (
                    SELECT 1 FROM request_reviewers rr WHERE rr.request_id = r.id AND rr.user_id = $2)),
                COUNT(*) FILTER (WHERE status IN ('approved', 'merged')),
                COUNT(*) FILTER (WHERE status = 'purchased'),
                COALESCE(SUM(COALESCE(actual_price, price)) FILTER (WHERE status = 'purchased'), 0)::bigint
           FROM purchase_requests r WHERE family_id = $1",
    )
    .bind(me.family_id)
    .bind(me.id)
    .fetch_one(&state.db)
    .await?;
    type Row = (uuid::Uuid, String, String, String, i64, i64);
    let rows: Vec<Row> = sqlx::query_as(
        "SELECT l.id, l.name, l.color, l.description,
                COALESCE(SUM(COALESCE(r.actual_price, r.price)), 0)::bigint, COUNT(*)
           FROM purchase_requests r
           JOIN request_labels rl ON rl.request_id = r.id
           JOIN labels l ON l.id = rl.label_id
          WHERE r.family_id = $1 AND r.status = 'purchased'
          GROUP BY l.id ORDER BY 5 DESC",
    )
    .bind(me.family_id)
    .fetch_all(&state.db)
    .await?;
    let (unlabeled_total, unlabeled_count): (i64, i64) = sqlx::query_as(
        "SELECT COALESCE(SUM(COALESCE(actual_price, price)), 0)::bigint, COUNT(*)
           FROM purchase_requests r
          WHERE family_id = $1 AND status = 'purchased'
            AND NOT EXISTS (SELECT 1 FROM request_labels rl WHERE rl.request_id = r.id)",
    )
    .bind(me.family_id)
    .fetch_one(&state.db)
    .await?;
    let mut by_label: Vec<LabelTotal> = rows
        .into_iter()
        .map(|(id, name, color, description, total, count)| LabelTotal {
            label: Some(Label { id, name, color, description }),
            total,
            count,
        })
        .collect();
    if unlabeled_count > 0 {
        by_label.push(LabelTotal { label: None, total: unlabeled_total, count: unlabeled_count });
    }
    Ok(Json(Dashboard {
        currency,
        total_requests: total,
        waiting_for_review: waiting,
        waiting_for_my_review: mine,
        approved,
        purchased,
        total_spending: spending,
        by_label,
    }))
}
