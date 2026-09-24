use axum::{
    extract::{Path, State},
    Json,
};
use rand::Rng;
use uuid::Uuid;

use crate::{
    auth::{load_member, AuthUser, MEMBER_SELECT},
    error::{ApiError, ApiResult},
    models::{Family, FamilyInfo, FamilyUpdate, Member, MemberUpdate},
    state::AppState,
};

// 読み間違えやすい 0/O, 1/I/L は除く
const INVITE_CHARSET: &[u8] = b"ABCDEFGHJKMNPQRSTUVWXYZ23456789";

pub fn generate_invite_code() -> String {
    let mut rng = rand::thread_rng();
    (0..10)
        .map(|_| INVITE_CHARSET[rng.gen_range(0..INVITE_CHARSET.len())] as char)
        .collect()
}

pub async fn family_info(state: &AppState, me: &Member) -> ApiResult<FamilyInfo> {
    let family: Family =
        sqlx::query_as("SELECT id, name, invite_code, currency FROM families WHERE id = $1")
            .bind(me.family_id)
            .fetch_one(&state.db)
            .await?;
    Ok(FamilyInfo {
        id: family.id,
        name: family.name,
        currency: family.currency,
        invite_code: me.is_admin.then_some(family.invite_code),
    })
}

pub async fn get(State(state): State<AppState>, AuthUser(me): AuthUser) -> ApiResult<Json<FamilyInfo>> {
    Ok(Json(family_info(&state, &me).await?))
}

pub async fn update(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(input): Json<FamilyUpdate>,
) -> ApiResult<Json<FamilyInfo>> {
    auth.require_admin()?;
    let name = input.name.trim();
    if name.is_empty() {
        return Err(ApiError::BadRequest("家族の名前を入力してください".into()));
    }
    sqlx::query("UPDATE families SET name = $1 WHERE id = $2")
        .bind(name)
        .bind(auth.0.family_id)
        .execute(&state.db)
        .await?;
    Ok(Json(family_info(&state, &auth.0).await?))
}

/// 招待コードを作り直す (漏れた場合に古いコードを無効化する)
pub async fn regenerate_invite_code(
    State(state): State<AppState>,
    auth: AuthUser,
) -> ApiResult<Json<FamilyInfo>> {
    auth.require_admin()?;
    sqlx::query("UPDATE families SET invite_code = $1 WHERE id = $2")
        .bind(generate_invite_code())
        .bind(auth.0.family_id)
        .execute(&state.db)
        .await?;
    Ok(Json(family_info(&state, &auth.0).await?))
}

pub async fn members(State(state): State<AppState>, AuthUser(me): AuthUser) -> ApiResult<Json<Vec<Member>>> {
    let rows: Vec<Member> =
        sqlx::query_as(&format!("{MEMBER_SELECT} WHERE m.family_id = $1 ORDER BY m.created_at"))
            .bind(me.family_id)
            .fetch_all(&state.db)
            .await?;
    Ok(Json(rows))
}

pub async fn update_member(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(user_id): Path<Uuid>,
    Json(input): Json<MemberUpdate>,
) -> ApiResult<Json<Member>> {
    auth.require_admin()?;
    // 管理者がいなくなるのを防ぐため、自分の Admin は外せない
    if user_id == auth.0.id && !input.is_admin {
        return Err(ApiError::Conflict("自分の管理者権限は外せません".into()));
    }
    let res = sqlx::query(
        "UPDATE family_members SET can_request = $1, can_review = $2, is_admin = $3
         WHERE user_id = $4 AND family_id = $5",
    )
    .bind(input.can_request)
    .bind(input.can_review)
    .bind(input.is_admin)
    .bind(user_id)
    .bind(auth.0.family_id)
    .execute(&state.db)
    .await?;
    if res.rows_affected() == 0 {
        return Err(ApiError::NotFound);
    }
    Ok(Json(load_member(&state, user_id).await?.ok_or(ApiError::NotFound)?))
}
