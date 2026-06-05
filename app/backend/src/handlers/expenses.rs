use axum::{
    extract::{Path, Query, State},
    Json,
};
use chrono::Utc;
use uuid::Uuid;

use crate::{
    auth::AuthUser,
    error::{ApiError, ApiResult},
    models::{
        DecisionInput, Expense, ExpenseInput, ExpenseStatus, ListExpenseQuery, UserRole,
    },
    state::AppState,
};

pub async fn list(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Query(q): Query<ListExpenseQuery>,
) -> ApiResult<Json<Vec<Expense>>> {
    let mut builder = sqlx::QueryBuilder::<sqlx::Postgres>::new(
        "SELECT * FROM expenses WHERE 1=1",
    );

    let mine_only = q.mine.unwrap_or(false) || claims.role == UserRole::Employee;
    if mine_only {
        builder.push(" AND user_id = ").push_bind(claims.sub);
    } else if let Some(uid) = q.user_id {
        builder.push(" AND user_id = ").push_bind(uid);
    }
    if let Some(st) = q.status {
        builder.push(" AND status = ").push_bind(st);
    }
    if let Some(from) = q.from {
        builder.push(" AND incurred_on >= ").push_bind(from);
    }
    if let Some(to) = q.to {
        builder.push(" AND incurred_on <= ").push_bind(to);
    }
    builder.push(" ORDER BY incurred_on DESC, created_at DESC");

    let rows: Vec<Expense> = builder.build_query_as().fetch_all(&state.db).await?;
    Ok(Json(rows))
}

pub async fn get_one(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<Expense>> {
    let row: Expense = sqlx::query_as("SELECT * FROM expenses WHERE id = $1")
        .bind(id)
        .fetch_optional(&state.db)
        .await?
        .ok_or(ApiError::NotFound)?;
    if claims.role == UserRole::Employee && row.user_id != claims.sub {
        return Err(ApiError::Forbidden);
    }
    Ok(Json(row))
}

pub async fn create(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Json(input): Json<ExpenseInput>,
) -> ApiResult<Json<Expense>> {
    validate_input(&input)?;
    let row: Expense = sqlx::query_as(
        "INSERT INTO expenses (user_id, title, description, category, amount_jpy, incurred_on)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *",
    )
    .bind(claims.sub)
    .bind(&input.title)
    .bind(&input.description)
    .bind(&input.category)
    .bind(input.amount_jpy)
    .bind(input.incurred_on)
    .fetch_one(&state.db)
    .await?;
    Ok(Json(row))
}

pub async fn update(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Path(id): Path<Uuid>,
    Json(input): Json<ExpenseInput>,
) -> ApiResult<Json<Expense>> {
    validate_input(&input)?;
    let existing: Expense = sqlx::query_as("SELECT * FROM expenses WHERE id = $1")
        .bind(id)
        .fetch_optional(&state.db)
        .await?
        .ok_or(ApiError::NotFound)?;
    if existing.user_id != claims.sub && claims.role != UserRole::Admin {
        return Err(ApiError::Forbidden);
    }
    if existing.status != ExpenseStatus::Draft && existing.status != ExpenseStatus::Rejected {
        return Err(ApiError::Conflict(
            "only draft or rejected can be edited".into(),
        ));
    }
    let row: Expense = sqlx::query_as(
        "UPDATE expenses
         SET title=$1, description=$2, category=$3, amount_jpy=$4, incurred_on=$5,
             status = CASE WHEN status = 'rejected' THEN 'draft'::expense_status ELSE status END,
             decided_at = NULL, decided_by = NULL, decision_note = NULL
         WHERE id=$6 RETURNING *",
    )
    .bind(&input.title)
    .bind(&input.description)
    .bind(&input.category)
    .bind(input.amount_jpy)
    .bind(input.incurred_on)
    .bind(id)
    .fetch_one(&state.db)
    .await?;
    Ok(Json(row))
}

pub async fn delete(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<serde_json::Value>> {
    let existing: Expense = sqlx::query_as("SELECT * FROM expenses WHERE id = $1")
        .bind(id)
        .fetch_optional(&state.db)
        .await?
        .ok_or(ApiError::NotFound)?;
    if existing.user_id != claims.sub && claims.role != UserRole::Admin {
        return Err(ApiError::Forbidden);
    }
    if existing.status == ExpenseStatus::Approved {
        return Err(ApiError::Conflict("approved expenses cannot be deleted".into()));
    }
    sqlx::query("DELETE FROM expenses WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;
    Ok(Json(serde_json::json!({"deleted": id})))
}

pub async fn submit(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<Expense>> {
    let existing: Expense = sqlx::query_as("SELECT * FROM expenses WHERE id = $1")
        .bind(id)
        .fetch_optional(&state.db)
        .await?
        .ok_or(ApiError::NotFound)?;
    if existing.user_id != claims.sub {
        return Err(ApiError::Forbidden);
    }
    if existing.status != ExpenseStatus::Draft && existing.status != ExpenseStatus::Rejected {
        return Err(ApiError::Conflict("only draft/rejected can be submitted".into()));
    }
    let row: Expense = sqlx::query_as(
        "UPDATE expenses SET status='submitted', submitted_at=$1,
            decided_at=NULL, decided_by=NULL, decision_note=NULL
         WHERE id=$2 RETURNING *",
    )
    .bind(Utc::now())
    .bind(id)
    .fetch_one(&state.db)
    .await?;
    Ok(Json(row))
}

pub async fn approve(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
    Json(decision): Json<DecisionInput>,
) -> ApiResult<Json<Expense>> {
    if !auth.can_approve() {
        return Err(ApiError::Forbidden);
    }
    decide(&state, id, ExpenseStatus::Approved, auth.0.sub, decision.note).await
}

pub async fn reject(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
    Json(decision): Json<DecisionInput>,
) -> ApiResult<Json<Expense>> {
    if !auth.can_approve() {
        return Err(ApiError::Forbidden);
    }
    decide(&state, id, ExpenseStatus::Rejected, auth.0.sub, decision.note).await
}

async fn decide(
    state: &AppState,
    id: Uuid,
    new_status: ExpenseStatus,
    by: Uuid,
    note: Option<String>,
) -> ApiResult<Json<Expense>> {
    let existing: Expense = sqlx::query_as("SELECT * FROM expenses WHERE id = $1")
        .bind(id)
        .fetch_optional(&state.db)
        .await?
        .ok_or(ApiError::NotFound)?;
    if existing.status != ExpenseStatus::Submitted {
        return Err(ApiError::Conflict(
            "only submitted expenses can be decided".into(),
        ));
    }
    let row: Expense = sqlx::query_as(
        "UPDATE expenses SET status=$1, decided_at=$2, decided_by=$3, decision_note=$4
         WHERE id=$5 RETURNING *",
    )
    .bind(&new_status)
    .bind(Utc::now())
    .bind(by)
    .bind(note)
    .bind(id)
    .fetch_one(&state.db)
    .await?;
    Ok(Json(row))
}

fn validate_input(input: &ExpenseInput) -> ApiResult<()> {
    if input.title.trim().is_empty() {
        return Err(ApiError::BadRequest("title is required".into()));
    }
    if input.amount_jpy < 0 {
        return Err(ApiError::BadRequest("amount must be >= 0".into()));
    }
    Ok(())
}
