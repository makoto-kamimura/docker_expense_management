use axum::{
    extract::{Query, State},
    http::{header, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use chrono::NaiveDate;

use crate::{
    auth::AuthUser,
    error::{ApiError, ApiResult},
    models::{ExpenseCategory, MonthlyReport, MonthlyReportRow, ReportQuery, UserRole},
    state::AppState,
};

fn month_range(year: i32, month: u32) -> ApiResult<(NaiveDate, NaiveDate)> {
    let from = NaiveDate::from_ymd_opt(year, month, 1)
        .ok_or_else(|| ApiError::BadRequest("invalid year/month".into()))?;
    let (ny, nm) = if month == 12 { (year + 1, 1) } else { (year, month + 1) };
    let next = NaiveDate::from_ymd_opt(ny, nm, 1)
        .ok_or_else(|| ApiError::BadRequest("invalid year/month".into()))?;
    let to = next.pred_opt().unwrap_or(next);
    Ok((from, to))
}

pub async fn monthly(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Query(q): Query<ReportQuery>,
) -> ApiResult<Json<MonthlyReport>> {
    let (from, to) = month_range(q.year, q.month)?;
    let target_user = resolve_target_user(&claims.role, claims.sub, q.user_id);

    let rows: Vec<(ExpenseCategory, i64, i64)> = match target_user {
        Some(uid) => sqlx::query_as(
            "SELECT category, COALESCE(SUM(amount_jpy),0)::bigint, COUNT(*)::bigint
             FROM expenses
             WHERE incurred_on BETWEEN $1 AND $2
               AND status = 'approved' AND user_id = $3
             GROUP BY category ORDER BY category",
        )
        .bind(from)
        .bind(to)
        .bind(uid)
        .fetch_all(&state.db)
        .await?,
        None => sqlx::query_as(
            "SELECT category, COALESCE(SUM(amount_jpy),0)::bigint, COUNT(*)::bigint
             FROM expenses
             WHERE incurred_on BETWEEN $1 AND $2 AND status = 'approved'
             GROUP BY category ORDER BY category",
        )
        .bind(from)
        .bind(to)
        .fetch_all(&state.db)
        .await?,
    };

    let report_rows: Vec<MonthlyReportRow> = rows
        .into_iter()
        .map(|(c, total, count)| MonthlyReportRow {
            category: c,
            total_jpy: total,
            count,
        })
        .collect();
    let total_jpy = report_rows.iter().map(|r| r.total_jpy).sum();
    Ok(Json(MonthlyReport {
        year: q.year,
        month: q.month,
        total_jpy,
        rows: report_rows,
    }))
}

pub async fn csv(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Query(q): Query<ReportQuery>,
) -> ApiResult<Response> {
    let (from, to) = month_range(q.year, q.month)?;
    let target_user = resolve_target_user(&claims.role, claims.sub, q.user_id);

    let rows: Vec<(String, String, NaiveDate, String, i64, String, Option<String>)> = match target_user {
        Some(uid) => sqlx::query_as(
            "SELECT u.name, u.email, e.incurred_on, e.title, e.amount_jpy,
                    e.category::text, e.decision_note
             FROM expenses e JOIN users u ON u.id = e.user_id
             WHERE e.incurred_on BETWEEN $1 AND $2 AND e.status = 'approved'
               AND e.user_id = $3
             ORDER BY e.incurred_on",
        )
        .bind(from)
        .bind(to)
        .bind(uid)
        .fetch_all(&state.db)
        .await?,
        None => sqlx::query_as(
            "SELECT u.name, u.email, e.incurred_on, e.title, e.amount_jpy,
                    e.category::text, e.decision_note
             FROM expenses e JOIN users u ON u.id = e.user_id
             WHERE e.incurred_on BETWEEN $1 AND $2 AND e.status = 'approved'
             ORDER BY e.incurred_on",
        )
        .bind(from)
        .bind(to)
        .fetch_all(&state.db)
        .await?,
    };

    let mut wtr = csv::Writer::from_writer(vec![]);
    wtr.write_record(["氏名", "メール", "発生日", "件名", "金額(円)", "カテゴリ", "メモ"])
        .map_err(|e| ApiError::Internal(anyhow::anyhow!(e)))?;
    for (name, email, date, title, amount, cat, note) in rows {
        wtr.write_record([
            name,
            email,
            date.to_string(),
            title,
            amount.to_string(),
            cat,
            note.unwrap_or_default(),
        ])
        .map_err(|e| ApiError::Internal(anyhow::anyhow!(e)))?;
    }
    let data = wtr
        .into_inner()
        .map_err(|e| ApiError::Internal(anyhow::anyhow!(e.to_string())))?;

    let filename = format!("expenses_{}_{:02}.csv", q.year, q.month);
    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "text/csv; charset=utf-8")
        .header(
            header::CONTENT_DISPOSITION,
            format!("attachment; filename=\"{}\"", filename),
        )
        .body(axum::body::Body::from(data))
        .map(|r| r.into_response())
        .map_err(|e| ApiError::Internal(anyhow::anyhow!(e)))
}

fn resolve_target_user(
    role: &UserRole,
    self_id: uuid::Uuid,
    requested: Option<uuid::Uuid>,
) -> Option<uuid::Uuid> {
    match role {
        UserRole::Employee => Some(self_id),
        UserRole::Approver | UserRole::Admin => requested,
    }
}
