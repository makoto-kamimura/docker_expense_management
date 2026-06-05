use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type, PartialEq, Eq)]
#[sqlx(type_name = "user_role", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum UserRole {
    Employee,
    Approver,
    Admin,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type, PartialEq, Eq)]
#[sqlx(type_name = "expense_status", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum ExpenseStatus {
    Draft,
    Submitted,
    Approved,
    Rejected,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type, PartialEq, Eq)]
#[sqlx(type_name = "expense_category", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum ExpenseCategory {
    Travel,
    Meals,
    Accommodation,
    Supplies,
    Entertainment,
    Communication,
    Other,
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct User {
    pub id: Uuid,
    pub email: String,
    #[serde(skip_serializing)]
    pub password_hash: String,
    pub name: String,
    pub role: UserRole,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize)]
pub struct UserPublic {
    pub id: Uuid,
    pub email: String,
    pub name: String,
    pub role: UserRole,
}

impl From<User> for UserPublic {
    fn from(u: User) -> Self {
        Self {
            id: u.id,
            email: u.email,
            name: u.name,
            role: u.role,
        }
    }
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct Expense {
    pub id: Uuid,
    pub user_id: Uuid,
    pub title: String,
    pub description: Option<String>,
    pub category: ExpenseCategory,
    pub amount_jpy: i64,
    pub incurred_on: NaiveDate,
    pub status: ExpenseStatus,
    pub submitted_at: Option<DateTime<Utc>>,
    pub decided_at: Option<DateTime<Utc>>,
    pub decided_by: Option<Uuid>,
    pub decision_note: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct Receipt {
    pub id: Uuid,
    pub expense_id: Uuid,
    pub file_name: String,
    pub content_type: String,
    pub byte_size: i64,
    #[serde(skip_serializing)]
    pub storage_key: String,
    pub uploaded_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct RegisterReq {
    pub email: String,
    pub password: String,
    pub name: String,
}

#[derive(Debug, Deserialize)]
pub struct LoginReq {
    pub email: String,
    pub password: String,
}

#[derive(Debug, Serialize)]
pub struct AuthResp {
    pub token: String,
    pub user: UserPublic,
}

#[derive(Debug, Deserialize)]
pub struct ExpenseInput {
    pub title: String,
    pub description: Option<String>,
    pub category: ExpenseCategory,
    pub amount_jpy: i64,
    pub incurred_on: NaiveDate,
}

#[derive(Debug, Deserialize, Default)]
pub struct DecisionInput {
    pub note: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ListExpenseQuery {
    pub status: Option<ExpenseStatus>,
    pub mine: Option<bool>,
    pub user_id: Option<Uuid>,
    pub from: Option<NaiveDate>,
    pub to: Option<NaiveDate>,
}

#[derive(Debug, Deserialize)]
pub struct ReportQuery {
    pub year: i32,
    pub month: u32,
    pub user_id: Option<Uuid>,
}

#[derive(Debug, Serialize)]
pub struct MonthlyReportRow {
    pub category: ExpenseCategory,
    pub total_jpy: i64,
    pub count: i64,
}

#[derive(Debug, Serialize)]
pub struct MonthlyReport {
    pub year: i32,
    pub month: u32,
    pub total_jpy: i64,
    pub rows: Vec<MonthlyReportRow>,
}
