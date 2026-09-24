use axum::{
    extract::{Path, Query, State},
    Json,
};
use serde_json::{json, Value};
use sqlx::{PgConnection, PgExecutor};
use uuid::Uuid;

use crate::{
    auth::AuthUser,
    error::{ApiError, ApiResult},
    handlers::{chores, labels::{labels_of, replace_labels}},
    previews,
    models::{
        ActionInput, LinkPreview, RequestCategory, AlternativeInput, AlternativeProduct, Attachment, CommentInput, ListQuery,
        Member, Permissions, PurchaseInput, PurchaseRequest, RequestDetail, RequestInput, RequestKind,
        RequestListItem, RequestRef, RequestStatus, Reviewer, ReviewerDecision, TimelineEntry, UserRef,
    },
    state::AppState,
};

const MAX_PRICE: i64 = 1_000_000_000_000;
const MAX_ALTERNATIVES: usize = 20;
const MAX_TEXT: usize = 10_000;

// ---------------------------------------------------------------------------
// 共通
// ---------------------------------------------------------------------------

/// 同じ家族の申請を取得する。他の家族の申請と、他人の Draft は存在しない扱い。
pub async fn load_request(state: &AppState, me: &Member, id: Uuid) -> ApiResult<PurchaseRequest> {
    let req: PurchaseRequest =
        sqlx::query_as("SELECT * FROM purchase_requests WHERE id = $1 AND family_id = $2")
            .bind(id)
            .bind(me.family_id)
            .fetch_optional(&state.db)
            .await?
            .ok_or(ApiError::NotFound)?;
    if req.status == RequestStatus::Draft && req.requester_id != me.id {
        return Err(ApiError::NotFound);
    }
    Ok(req)
}

pub async fn reviewers_of(state: &AppState, request_id: Uuid) -> ApiResult<Vec<Reviewer>> {
    Ok(sqlx::query_as(
        "SELECT u.id, u.name, u.avatar_url, rr.decision, rr.decided_at
           FROM request_reviewers rr JOIN users u ON u.id = rr.user_id
          WHERE rr.request_id = $1 ORDER BY u.name",
    )
    .bind(request_id)
    .fetch_all(&state.db)
    .await?)
}

/// ログインユーザーが今この申請に対してできること。API のチェックと画面のボタン表示の両方に使う。
pub fn permissions(me: &Member, r: &PurchaseRequest, reviewers: &[Reviewer]) -> Permissions {
    use RequestStatus::*;
    let is_requester = r.requester_id == me.id;
    let is_reviewer = reviewers.iter().any(|x| x.id == me.id);
    let s = r.status;
    Permissions {
        can_edit: is_requester && s.is_editable(),
        can_submit: is_requester && s.is_editable() && !reviewers.is_empty(),
        can_approve: is_reviewer && s.is_in_review(),
        can_request_changes: is_reviewer && s.is_in_review(),
        can_reject: is_reviewer && (s.is_in_review() || matches!(s, ChangesNeeded | Approved)),
        can_merge: (is_requester || is_reviewer) && s == Approved,
        can_mark_purchased: is_requester && s == Merged,
        can_close: is_requester && s != Draft && !s.is_finished(),
        can_delete: is_requester && s == Draft,
        can_comment: s != Draft || is_requester,
        can_upload_evidence: is_requester && !s.is_finished(),
        can_upload_receipt: is_requester && matches!(s, Merged | Purchased),
        can_reopen: (is_requester || is_reviewer) && s == Closed,
        can_label: is_requester || is_reviewer,
    }
}

/// 操作できない理由に応じたエラー。当事者でなければ 403、状態が合わなければ 409。
fn deny(is_party: bool) -> ApiError {
    if is_party {
        ApiError::Conflict("今の状態ではこの操作はできません".into())
    } else {
        ApiError::Forbidden
    }
}

pub async fn log_activity<'e, E: PgExecutor<'e>>(
    e: E,
    request_id: Uuid,
    user_id: Uuid,
    action: &str,
    metadata: Value,
) -> ApiResult<()> {
    sqlx::query("INSERT INTO activities (request_id, user_id, action, metadata) VALUES ($1, $2, $3, $4)")
        .bind(request_id)
        .bind(user_id)
        .bind(action)
        .bind(metadata)
        .execute(e)
        .await?;
    Ok(())
}

async fn add_comment(conn: &mut PgConnection, request_id: Uuid, user_id: Uuid, body: &str) -> ApiResult<()> {
    sqlx::query("INSERT INTO comments (request_id, user_id, body) VALUES ($1, $2, $3)")
        .bind(request_id)
        .bind(user_id)
        .bind(body)
        .execute(conn)
        .await?;
    Ok(())
}

async fn timeline(state: &AppState, request_id: Uuid) -> ApiResult<Vec<TimelineEntry>> {
    type Row = (Uuid, String, chrono::DateTime<chrono::Utc>, Option<Uuid>, Option<String>, Option<String>);
    let comments: Vec<Row> = sqlx::query_as(
        "SELECT c.id, c.body, c.created_at, u.id, u.name, u.avatar_url
           FROM comments c LEFT JOIN users u ON u.id = c.user_id
          WHERE c.request_id = $1",
    )
    .bind(request_id)
    .fetch_all(&state.db)
    .await?;
    type EventRow = (Uuid, String, Value, chrono::DateTime<chrono::Utc>, Option<Uuid>, Option<String>, Option<String>);
    let events: Vec<EventRow> = sqlx::query_as(
        "SELECT a.id, a.action, a.metadata, a.created_at, u.id, u.name, u.avatar_url
           FROM activities a LEFT JOIN users u ON u.id = a.user_id
          WHERE a.request_id = $1",
    )
    .bind(request_id)
    .fetch_all(&state.db)
    .await?;

    let user = |id: Option<Uuid>, name: Option<String>, avatar_url: Option<String>| {
        id.zip(name).map(|(id, name)| UserRef { id, name, avatar_url })
    };
    let mut entries: Vec<TimelineEntry> = comments
        .into_iter()
        .map(|(id, body, created_at, uid, name, avatar)| TimelineEntry::Comment {
            id,
            user: user(uid, name, avatar),
            body,
            created_at,
        })
        .chain(events.into_iter().map(|(id, action, metadata, created_at, uid, name, avatar)| {
            TimelineEntry::Event {
                id,
                user: user(uid, name, avatar),
                action,
                metadata,
                created_at,
            }
        }))
        .collect();
    // 同時刻 (承認 + コメントなど) は操作 → コメントの順に並べる
    entries.sort_by_key(|e| (e.created_at(), matches!(e, TimelineEntry::Comment { .. })));
    Ok(entries)
}

async fn build_detail(state: &AppState, me: &Member, request: PurchaseRequest) -> ApiResult<RequestDetail> {
    let id = request.id;
    let reviewers = reviewers_of(state, id).await?;
    let (family_name,): (String,) = sqlx::query_as("SELECT name FROM families WHERE id = $1")
        .bind(request.family_id)
        .fetch_one(&state.db)
        .await?;
    let requester: UserRef = sqlx::query_as("SELECT id, name, avatar_url FROM users WHERE id = $1")
        .bind(request.requester_id)
        .fetch_one(&state.db)
        .await?;
    let merged_by: Option<UserRef> = match request.merged_by {
        Some(uid) => sqlx::query_as("SELECT id, name, avatar_url FROM users WHERE id = $1")
            .bind(uid)
            .fetch_optional(&state.db)
            .await?,
        None => None,
    };
    let alternatives: Vec<AlternativeProduct> = sqlx::query_as(
        "SELECT id, position, name, price, url, notes FROM alternative_products
          WHERE request_id = $1 ORDER BY position",
    )
    .bind(id)
    .fetch_all(&state.db)
    .await?;
    let attachments: Vec<Attachment> =
        sqlx::query_as("SELECT * FROM attachments WHERE request_id = $1 ORDER BY created_at")
            .bind(id)
            .fetch_all(&state.db)
            .await?;
    let timeline = timeline(state, id).await?;
    let permissions = permissions(me, &request, &reviewers);
    const REF_SELECT: &str = "SELECT r.id, r.title, r.kind, r.status, u.name AS requester_name
           FROM purchase_requests r JOIN users u ON u.id = r.requester_id";
    // 分岐元・分岐先も、他人の下書きは見せない
    let parent: Option<RequestRef> = match request.parent_id {
        Some(pid) => sqlx::query_as(&format!(
            "{REF_SELECT} WHERE r.id = $1 AND r.family_id = $2 AND (r.status <> 'draft' OR r.requester_id = $3)"
        ))
        .bind(pid)
        .bind(request.family_id)
        .bind(me.id)
        .fetch_optional(&state.db)
        .await?,
        None => None,
    };
    let children: Vec<RequestRef> = sqlx::query_as(&format!(
        "{REF_SELECT} WHERE r.parent_id = $1 AND (r.status <> 'draft' OR r.requester_id = $2) ORDER BY r.created_at"
    ))
    .bind(id)
    .bind(me.id)
    .fetch_all(&state.db)
    .await?;
    let previews: Vec<LinkPreview> = sqlx::query_as(
        "SELECT id, url, title, site_name, image_key IS NOT NULL AS has_image FROM link_previews
          WHERE status = 'ok'
            AND url IN (SELECT $1 UNION SELECT $2 UNION SELECT url FROM alternative_products WHERE request_id = $3)",
    )
    .bind(&request.product_url)
    .bind(&request.final_product_url)
    .bind(id)
    .fetch_all(&state.db)
    .await?;
    let requester_contributions = chores::contributions(&state.db, request.family_id, request.requester_id).await?;
    let labels = labels_of(state, id).await?;
    Ok(RequestDetail {
        labels,
        requester_contributions,
        previews,
        request,
        parent,
        children,
        family_name,
        requester,
        merged_by,
        reviewers,
        alternatives,
        attachments,
        timeline,
        permissions,
    })
}

pub async fn detail_json(state: &AppState, me: &Member, id: Uuid) -> ApiResult<Json<RequestDetail>> {
    let request = load_request(state, me, id).await?;
    Ok(Json(build_detail(state, me, request).await?))
}

// ---------------------------------------------------------------------------
// 一覧・取得
// ---------------------------------------------------------------------------

pub async fn list(
    State(state): State<AppState>,
    AuthUser(me): AuthUser,
    Query(q): Query<ListQuery>,
) -> ApiResult<Json<Vec<RequestListItem>>> {
    let mut b = sqlx::QueryBuilder::<sqlx::Postgres>::new(
        "SELECT r.*, u.name AS requester_name,
                ARRAY(SELECT u2.name FROM request_reviewers rr JOIN users u2 ON u2.id = rr.user_id
                       WHERE rr.request_id = r.id ORDER BY u2.name) AS reviewer_names,
                (SELECT COUNT(*) FROM comments c WHERE c.request_id = r.id) AS comment_count,
                (SELECT lp.id FROM link_previews lp
                  WHERE lp.url = COALESCE(r.final_product_url, r.product_url)
                    AND lp.status = 'ok' AND lp.image_key IS NOT NULL) AS preview_id,
                COALESCE((SELECT json_agg(json_build_object('id', l.id, 'name', l.name, 'color', l.color, 'description', l.description)
                                          ORDER BY l.name)
                            FROM request_labels rl JOIN labels l ON l.id = rl.label_id
                           WHERE rl.request_id = r.id), '[]'::json) AS labels
           FROM purchase_requests r JOIN users u ON u.id = r.requester_id
          WHERE r.family_id = ",
    );
    b.push_bind(me.family_id);
    // 他人の Draft は見せない
    b.push(" AND (r.status <> 'draft' OR r.requester_id = ").push_bind(me.id).push(")");
    match q.filter.as_deref().unwrap_or("all") {
        "waiting" => {
            b.push(" AND r.status IN ('submitted', 'under_review')");
        }
        "to_review" => {
            b.push(" AND r.status IN ('submitted', 'under_review')")
                .push(" AND EXISTS (SELECT 1 FROM request_reviewers rr WHERE rr.request_id = r.id AND rr.user_id = ")
                .push_bind(me.id)
                .push(")");
        }
        "mine" => {
            b.push(" AND r.requester_id = ").push_bind(me.id);
        }
        "approved" => {
            b.push(" AND r.status IN ('approved', 'merged')");
        }
        "purchased" => {
            b.push(" AND r.status = 'purchased'");
        }
        "closed" => {
            b.push(" AND r.status = 'closed'");
        }
        "all" => {}
        other => return Err(ApiError::BadRequest(format!("unknown filter: {other}"))),
    }
    if let Some(kind) = q.kind {
        b.push(" AND r.kind = ").push_bind(kind);
    }
    if let Some(label) = q.label {
        b.push(" AND EXISTS (SELECT 1 FROM request_labels rl WHERE rl.request_id = r.id AND rl.label_id = ")
            .push_bind(label)
            .push(")");
    }
    b.push(" ORDER BY r.updated_at DESC");
    Ok(Json(b.build_query_as().fetch_all(&state.db).await?))
}

/// 詳細。Reviewer が Submitted の申請を開いたら Under Review に進める。
pub async fn get_one(
    State(state): State<AppState>,
    AuthUser(me): AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<RequestDetail>> {
    let mut request = load_request(&state, &me, id).await?;
    if request.status == RequestStatus::Submitted {
        let reviewers = reviewers_of(&state, id).await?;
        if reviewers.iter().any(|r| r.id == me.id) {
            let mut tx = state.db.begin().await?;
            let updated = sqlx::query(
                "UPDATE purchase_requests SET status = 'under_review' WHERE id = $1 AND status = 'submitted'",
            )
            .bind(id)
            .execute(&mut *tx)
            .await?;
            if updated.rows_affected() == 1 {
                log_activity(&mut *tx, id, me.id, "started_review", json!({})).await?;
            }
            tx.commit().await?;
            request = load_request(&state, &me, id).await?;
        }
    }
    Ok(Json(build_detail(&state, &me, request).await?))
}

// ---------------------------------------------------------------------------
// 作成・編集
// ---------------------------------------------------------------------------

pub async fn create(
    State(state): State<AppState>,
    AuthUser(me): AuthUser,
    Json(input): Json<RequestInput>,
) -> ApiResult<Json<RequestDetail>> {
    if !me.can_request {
        return Err(ApiError::Forbidden);
    }
    validate_input(&input)?;
    // 分岐元は同じ家族で見える稟議に限る (他の家族・他人の下書きは 404)
    let parent = match input.parent_id {
        Some(pid) => Some(load_request(&state, &me, pid).await?),
        None => None,
    };
    let (currency,): (String,) = sqlx::query_as("SELECT currency FROM families WHERE id = $1")
        .bind(me.family_id)
        .fetch_one(&state.db)
        .await?;

    let mut tx = state.db.begin().await?;
    let (id,): (Uuid,) = sqlx::query_as(
        "INSERT INTO purchase_requests
            (family_id, requester_id, title, reason, price, currency, seller, product_name,
             product_url, category, planned_date, notes, kind, end_date, parent_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING id",
    )
    .bind(me.family_id)
    .bind(me.id)
    .bind(input.title.trim())
    .bind(input.reason.trim())
    .bind(input.price)
    .bind(&currency)
    .bind(input.seller.trim())
    .bind(clean(&input.product_name))
    .bind(clean(&input.product_url))
    .bind(input.category.unwrap_or(RequestCategory::Other))
    .bind(input.planned_date)
    .bind(clean(&input.notes))
    .bind(input.kind)
    .bind(input.end_date)
    .bind(parent.as_ref().map(|p| p.id))
    .fetch_one(&mut *tx)
    .await?;
    replace_reviewers(&mut tx, &me, id, &input.reviewer_ids).await?;
    if let Some(label_ids) = &input.label_ids {
        replace_labels(&mut tx, me.family_id, id, label_ids).await?;
    }
    replace_alternatives(&mut tx, id, &input.alternatives).await?;
    let meta = match &parent {
        Some(p) => json!({ "parent_id": p.id, "parent_title": p.title }),
        None => json!({}),
    };
    log_activity(&mut *tx, id, me.id, "created", meta).await?;
    tx.commit().await?;
    previews::ensure(&state, preview_urls(&input));
    detail_json(&state, &me, id).await
}

pub async fn update(
    State(state): State<AppState>,
    AuthUser(me): AuthUser,
    Path(id): Path<Uuid>,
    Json(input): Json<RequestInput>,
) -> ApiResult<Json<RequestDetail>> {
    validate_input(&input)?;
    let old = load_request(&state, &me, id).await?;
    let reviewers = reviewers_of(&state, id).await?;
    if !permissions(&me, &old, &reviewers).can_edit {
        return Err(deny(old.requester_id == me.id));
    }

    // 変更履歴: 項目ごとに「変更前 → 変更後」を Activity に残す
    let mut changes: Vec<Value> = Vec::new();
    let mut diff = |field: &str, before: Value, after: Value| {
        if before != after {
            changes.push(json!({ "field": field, "before": before, "after": after }));
        }
    };
    diff("title", json!(old.title), json!(input.title.trim()));
    diff("kind", json!(old.kind), json!(input.kind));
    diff("reason", json!(old.reason), json!(input.reason.trim()));
    diff("price", json!(old.price), json!(input.price));
    diff("seller", json!(old.seller), json!(input.seller.trim()));
    diff("product", json!(old.product_name), json!(clean(&input.product_name)));
    diff("product link", json!(old.product_url), json!(clean(&input.product_url)));
    if let Some(category) = input.category {
        diff("category", json!(old.category), json!(category));
    }
    diff("purchase date", json!(old.planned_date), json!(input.planned_date));
    diff("end date", json!(old.end_date), json!(input.end_date));
    diff("notes", json!(old.notes), json!(clean(&input.notes)));

    let mut old_ids: Vec<Uuid> = reviewers.iter().map(|r| r.id).collect();
    let mut new_ids = input.reviewer_ids.clone();
    old_ids.sort();
    new_ids.sort();
    new_ids.dedup();
    if old_ids != new_ids {
        let new_names: Vec<(String,)> =
            sqlx::query_as("SELECT name FROM users WHERE id = ANY($1) ORDER BY name")
                .bind(&new_ids)
                .fetch_all(&state.db)
                .await?;
        let old_names: Vec<&str> = reviewers.iter().map(|r| r.name.as_str()).collect();
        let new_names: Vec<String> = new_names.into_iter().map(|n| n.0).collect();
        diff("reviewers", json!(old_names), json!(new_names));
    }
    let old_alts: Vec<(String, Option<i64>, Option<String>, Option<String>)> = sqlx::query_as(
        "SELECT name, price, url, notes FROM alternative_products WHERE request_id = $1 ORDER BY position",
    )
    .bind(id)
    .fetch_all(&state.db)
    .await?;
    let new_alts: Vec<_> = input
        .alternatives
        .iter()
        .map(|a| (a.name.trim().to_string(), a.price, clean(&a.url), clean(&a.notes)))
        .collect();
    if old_alts != new_alts {
        // 表示用に「名前 (金額)」の一覧で残す
        let summary = |alts: &[(String, Option<i64>, Option<String>, Option<String>)]| -> Vec<Value> {
            alts.iter().map(|(n, p, _, _)| json!({ "name": n, "price": p })).collect()
        };
        diff("alternatives", json!(summary(&old_alts)), json!(summary(&new_alts)));
    }
    let mut changed: Vec<String> = changes
        .iter()
        .filter_map(|c| c["field"].as_str().map(str::to_string))
        .collect();

    let mut tx = state.db.begin().await?;
    sqlx::query(
        "UPDATE purchase_requests
            SET title = $1, reason = $2, price = $3, seller = $4, product_name = $5,
                product_url = $6, category = COALESCE($7, category), planned_date = $8, notes = $9,
                kind = $10, end_date = $11
          WHERE id = $12",
    )
    .bind(input.title.trim())
    .bind(input.reason.trim())
    .bind(input.price)
    .bind(input.seller.trim())
    .bind(clean(&input.product_name))
    .bind(clean(&input.product_url))
    .bind(input.category)
    .bind(input.planned_date)
    .bind(clean(&input.notes))
    .bind(input.kind)
    .bind(input.end_date)
    .bind(id)
    .execute(&mut *tx)
    .await?;
    replace_reviewers(&mut tx, &me, id, &input.reviewer_ids).await?;
    replace_alternatives(&mut tx, id, &input.alternatives).await?;
    if let Some(label_ids) = &input.label_ids {
        let before: Vec<String> = labels_of(&state, id).await?.into_iter().map(|l| l.name).collect();
        let (added, removed) = replace_labels(&mut tx, me.family_id, id, label_ids).await?;
        if !added.is_empty() || !removed.is_empty() {
            let mut after: Vec<String> = before.iter().filter(|n| !removed.contains(n)).cloned().chain(added).collect();
            after.sort();
            changes.push(json!({ "field": "labels", "before": before, "after": after }));
            changed.push("labels".to_string());
        }
    }
    // Draft 中の編集は記録しない (まだ誰も見ていないため)
    if !changed.is_empty() && old.status != RequestStatus::Draft {
        log_activity(&mut *tx, id, me.id, "updated", json!({ "fields": changed, "changes": changes })).await?;
    }
    tx.commit().await?;
    previews::ensure(&state, preview_urls(&input));
    detail_json(&state, &me, id).await
}

pub async fn delete(
    State(state): State<AppState>,
    AuthUser(me): AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<Value>> {
    let req = load_request(&state, &me, id).await?;
    let reviewers = reviewers_of(&state, id).await?;
    if !permissions(&me, &req, &reviewers).can_delete {
        return Err(deny(req.requester_id == me.id));
    }
    // 添付ファイルの実体も消す
    let keys: Vec<(String,)> = sqlx::query_as("SELECT storage_key FROM attachments WHERE request_id = $1")
        .bind(id)
        .fetch_all(&state.db)
        .await?;
    sqlx::query("DELETE FROM purchase_requests WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;
    for (key,) in keys {
        tokio::fs::remove_file(std::path::Path::new(&state.config.upload_dir).join(key)).await.ok();
    }
    Ok(Json(json!({ "deleted": id })))
}

// ---------------------------------------------------------------------------
// ワークフロー
// ---------------------------------------------------------------------------

/// Draft / Changes Needed → Submitted
pub async fn submit(
    State(state): State<AppState>,
    AuthUser(me): AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<RequestDetail>> {
    let req = load_request(&state, &me, id).await?;
    let reviewers = reviewers_of(&state, id).await?;
    let perms = permissions(&me, &req, &reviewers);
    if !perms.can_submit {
        if perms.can_edit && reviewers.is_empty() {
            return Err(ApiError::BadRequest("レビュアーを1人以上選んでから申請してください".into()));
        }
        return Err(deny(req.requester_id == me.id));
    }
    // 下書きは途中でも保存できるが、申請時には必須項目をそろえてもらう
    let mut missing = Vec::new();
    match req.kind {
        RequestKind::Purchase => {
            if req.seller.trim().is_empty() { missing.push("購入先"); }
            if req.reason.trim().is_empty() { missing.push("購入理由"); }
        }
        RequestKind::Outing => {
            if req.product_name.as_deref().map_or(true, |s| s.trim().is_empty()) { missing.push("行き先"); }
            if req.reason.trim().is_empty() { missing.push("行きたい理由"); }
        }
        RequestKind::Activity => {
            if req.reason.trim().is_empty() { missing.push("やりたい理由"); }
        }
    }
    if !missing.is_empty() {
        return Err(ApiError::BadRequest(format!("次の項目を入力してください: {}", missing.join("、"))));
    }
    let action = if req.status == RequestStatus::ChangesNeeded { "resubmitted" } else { "submitted" };
    // 申請時点の家事の実績を残す (レビュー中に実績が変わっても、申請時の状態を確認できるように)
    let c = chores::contributions(&state.db, me.family_id, me.id).await?;
    let snapshot = json!({ "chores": {
        "current_streak": c.current_streak,
        "last_30_days": c.last_30_days,
        "total_days": c.total_days,
    }});

    let mut tx = state.db.begin().await?;
    sqlx::query("UPDATE purchase_requests SET status = 'submitted', submitted_at = now() WHERE id = $1")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    // 再申請では前回の判定をリセットし、もう一度レビューしてもらう
    sqlx::query("UPDATE request_reviewers SET decision = 'pending', decided_at = NULL WHERE request_id = $1")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    log_activity(&mut *tx, id, me.id, action, snapshot).await?;
    // 分岐した稟議を初めて申請したら、分岐元のアクティビティにも残す
    if let (Some(pid), "submitted") = (req.parent_id, action) {
        let already: (bool,) = sqlx::query_as(
            "SELECT EXISTS (SELECT 1 FROM activities WHERE request_id = $1 AND action = 'branched' AND metadata->>'child_id' = $2)",
        )
        .bind(pid)
        .bind(id.to_string())
        .fetch_one(&mut *tx)
        .await?;
        if !already.0 {
            log_activity(&mut *tx, pid, me.id, "branched", json!({ "child_id": id, "child_title": req.title, "child_kind": req.kind }))
                .await?;
        }
    }
    tx.commit().await?;
    detail_json(&state, &me, id).await
}

#[derive(Clone, Copy)]
enum Review {
    Approve,
    RequestChanges,
    Reject,
}

async fn review(state: &AppState, me: &Member, id: Uuid, kind: Review, input: ActionInput) -> ApiResult<Json<RequestDetail>> {
    let req = load_request(state, me, id).await?;
    let reviewers = reviewers_of(state, id).await?;
    let perms = permissions(me, &req, &reviewers);
    let is_reviewer = reviewers.iter().any(|r| r.id == me.id);
    let allowed = match kind {
        Review::Approve => perms.can_approve,
        Review::RequestChanges => perms.can_request_changes,
        Review::Reject => perms.can_reject,
    };
    if !allowed {
        return Err(deny(is_reviewer));
    }
    let comment = clean(&input.comment);
    if matches!(kind, Review::RequestChanges) && comment.is_none() {
        return Err(ApiError::BadRequest("修正してほしい内容をコメントに書いてください".into()));
    }
    let (status_sql, decision, action) = match kind {
        Review::Approve => (
            "UPDATE purchase_requests SET status = 'approved', approved_at = now() WHERE id = $1",
            ReviewerDecision::Approved,
            "approved",
        ),
        Review::RequestChanges => (
            "UPDATE purchase_requests SET status = 'changes_needed' WHERE id = $1",
            ReviewerDecision::ChangesRequested,
            "changes_requested",
        ),
        Review::Reject => (
            "UPDATE purchase_requests SET status = 'closed', closed_at = now(), close_reason = 'rejected' WHERE id = $1",
            ReviewerDecision::Rejected,
            "rejected",
        ),
    };

    let mut tx = state.db.begin().await?;
    sqlx::query(status_sql).bind(id).execute(&mut *tx).await?;
    sqlx::query(
        "UPDATE request_reviewers SET decision = $1, decided_at = now() WHERE request_id = $2 AND user_id = $3",
    )
    .bind(decision)
    .bind(id)
    .bind(me.id)
    .execute(&mut *tx)
    .await?;
    log_activity(&mut *tx, id, me.id, action, json!({})).await?;
    if let Some(body) = &comment {
        add_comment(&mut tx, id, me.id, body).await?;
    }
    tx.commit().await?;
    detail_json(state, me, id).await
}

pub async fn approve(
    State(state): State<AppState>,
    AuthUser(me): AuthUser,
    Path(id): Path<Uuid>,
    input: Option<Json<ActionInput>>,
) -> ApiResult<Json<RequestDetail>> {
    review(&state, &me, id, Review::Approve, input.map(|j| j.0).unwrap_or_default()).await
}

pub async fn request_changes(
    State(state): State<AppState>,
    AuthUser(me): AuthUser,
    Path(id): Path<Uuid>,
    input: Option<Json<ActionInput>>,
) -> ApiResult<Json<RequestDetail>> {
    review(&state, &me, id, Review::RequestChanges, input.map(|j| j.0).unwrap_or_default()).await
}

pub async fn reject(
    State(state): State<AppState>,
    AuthUser(me): AuthUser,
    Path(id): Path<Uuid>,
    input: Option<Json<ActionInput>>,
) -> ApiResult<Json<RequestDetail>> {
    review(&state, &me, id, Review::Reject, input.map(|j| j.0).unwrap_or_default()).await
}

/// Approved → Merged (家族として購入に合意した)
pub async fn merge(
    State(state): State<AppState>,
    AuthUser(me): AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<RequestDetail>> {
    let req = load_request(&state, &me, id).await?;
    let reviewers = reviewers_of(&state, id).await?;
    if !permissions(&me, &req, &reviewers).can_merge {
        let is_party = req.requester_id == me.id || reviewers.iter().any(|r| r.id == me.id);
        return Err(deny(is_party));
    }
    let mut tx = state.db.begin().await?;
    sqlx::query("UPDATE purchase_requests SET status = 'merged', merged_at = now(), merged_by = $1 WHERE id = $2")
        .bind(me.id)
        .bind(id)
        .execute(&mut *tx)
        .await?;
    log_activity(&mut *tx, id, me.id, "merged", json!({})).await?;
    tx.commit().await?;
    detail_json(&state, &me, id).await
}

/// Merged → Purchased (実際の購入情報を記録)
pub async fn mark_purchased(
    State(state): State<AppState>,
    AuthUser(me): AuthUser,
    Path(id): Path<Uuid>,
    Json(input): Json<PurchaseInput>,
) -> ApiResult<Json<RequestDetail>> {
    let req = load_request(&state, &me, id).await?;
    let reviewers = reviewers_of(&state, id).await?;
    if !permissions(&me, &req, &reviewers).can_mark_purchased {
        return Err(deny(req.requester_id == me.id));
    }
    if !(0..=MAX_PRICE).contains(&input.actual_price) {
        return Err(ApiError::BadRequest("購入金額が正しくありません".into()));
    }
    let final_url = clean(&input.final_product_url);
    if let Some(url) = &final_url {
        validate_url(url, "商品URL")?;
    }
    let mut tx = state.db.begin().await?;
    sqlx::query(
        "UPDATE purchase_requests
            SET status = 'purchased', purchased_at = now(), actual_price = $1, purchase_date = $2,
                order_number = $3, final_product_url = $4
          WHERE id = $5",
    )
    .bind(input.actual_price)
    .bind(input.purchase_date)
    .bind(clean(&input.order_number))
    .bind(&final_url)
    .bind(id)
    .execute(&mut *tx)
    .await?;
    log_activity(&mut *tx, id, me.id, "purchased", json!({ "actual_price": input.actual_price })).await?;
    tx.commit().await?;
    previews::ensure(&state, final_url);
    detail_json(&state, &me, id).await
}

/// 申請者による取り下げ (→ Closed)
pub async fn close(
    State(state): State<AppState>,
    AuthUser(me): AuthUser,
    Path(id): Path<Uuid>,
    input: Option<Json<ActionInput>>,
) -> ApiResult<Json<RequestDetail>> {
    let req = load_request(&state, &me, id).await?;
    let reviewers = reviewers_of(&state, id).await?;
    if !permissions(&me, &req, &reviewers).can_close {
        return Err(deny(req.requester_id == me.id));
    }
    let comment = input.and_then(|j| clean(&j.0.comment));
    let mut tx = state.db.begin().await?;
    sqlx::query(
        "UPDATE purchase_requests SET status = 'closed', closed_at = now(), close_reason = 'withdrawn' WHERE id = $1",
    )
    .bind(id)
    .execute(&mut *tx)
    .await?;
    log_activity(&mut *tx, id, me.id, "withdrawn", json!({})).await?;
    if let Some(body) = &comment {
        add_comment(&mut tx, id, me.id, body).await?;
    }
    tx.commit().await?;
    detail_json(&state, &me, id).await
}

/// Closed → Submitted (却下・取り下げた稟議をもう一度レビューに戻す)
pub async fn reopen(
    State(state): State<AppState>,
    AuthUser(me): AuthUser,
    Path(id): Path<Uuid>,
    input: Option<Json<ActionInput>>,
) -> ApiResult<Json<RequestDetail>> {
    let req = load_request(&state, &me, id).await?;
    let reviewers = reviewers_of(&state, id).await?;
    if !permissions(&me, &req, &reviewers).can_reopen {
        let is_party = req.requester_id == me.id || reviewers.iter().any(|r| r.id == me.id);
        return Err(deny(is_party));
    }
    if reviewers.is_empty() {
        return Err(ApiError::Conflict("レビュアーがいないため再オープンできません".into()));
    }
    let comment = input.and_then(|j| clean(&j.0.comment));
    let mut tx = state.db.begin().await?;
    sqlx::query(
        "UPDATE purchase_requests
            SET status = 'submitted', submitted_at = now(), approved_at = NULL,
                closed_at = NULL, close_reason = NULL
          WHERE id = $1",
    )
    .bind(id)
    .execute(&mut *tx)
    .await?;
    // もう一度レビューしてもらうので、前回の判定はリセットする
    sqlx::query("UPDATE request_reviewers SET decision = 'pending', decided_at = NULL WHERE request_id = $1")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    log_activity(&mut *tx, id, me.id, "reopened", json!({ "previous_reason": req.close_reason })).await?;
    if let Some(body) = &comment {
        add_comment(&mut tx, id, me.id, body).await?;
    }
    tx.commit().await?;
    detail_json(&state, &me, id).await
}

pub async fn comment(
    State(state): State<AppState>,
    AuthUser(me): AuthUser,
    Path(id): Path<Uuid>,
    Json(input): Json<CommentInput>,
) -> ApiResult<Json<RequestDetail>> {
    let req = load_request(&state, &me, id).await?;
    let reviewers = reviewers_of(&state, id).await?;
    if !permissions(&me, &req, &reviewers).can_comment {
        return Err(ApiError::Forbidden);
    }
    let body = input.body.trim();
    if body.is_empty() || body.len() > MAX_TEXT {
        return Err(ApiError::BadRequest("コメントを入力してください".into()));
    }
    let mut tx = state.db.begin().await?;
    // Reviewer がコメントしたら「確認中」に進める
    if req.status == RequestStatus::Submitted && reviewers.iter().any(|r| r.id == me.id) {
        sqlx::query("UPDATE purchase_requests SET status = 'under_review' WHERE id = $1")
            .bind(id)
            .execute(&mut *tx)
            .await?;
        log_activity(&mut *tx, id, me.id, "started_review", json!({})).await?;
    }
    add_comment(&mut tx, id, me.id, body).await?;
    tx.commit().await?;
    detail_json(&state, &me, id).await
}

// ---------------------------------------------------------------------------
// 入力の保存・検証
// ---------------------------------------------------------------------------

async fn replace_reviewers(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    me: &Member,
    request_id: Uuid,
    ids: &[Uuid],
) -> ApiResult<()> {
    let mut ids = ids.to_vec();
    ids.sort();
    ids.dedup();
    if ids.contains(&me.id) {
        return Err(ApiError::BadRequest("自分の申請はレビューできません".into()));
    }
    let (found,): (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM family_members WHERE family_id = $1 AND can_review AND user_id = ANY($2)",
    )
    .bind(me.family_id)
    .bind(&ids)
    .fetch_one(&mut **tx)
    .await?;
    if found as usize != ids.len() {
        return Err(ApiError::BadRequest("レビュアーはレビュー権限のある家族から選んでください".into()));
    }
    // 残る Reviewer の判定は維持する
    sqlx::query("DELETE FROM request_reviewers WHERE request_id = $1 AND NOT (user_id = ANY($2))")
        .bind(request_id)
        .bind(&ids)
        .execute(&mut **tx)
        .await?;
    sqlx::query(
        "INSERT INTO request_reviewers (request_id, user_id) SELECT $1, UNNEST($2::uuid[])
         ON CONFLICT DO NOTHING",
    )
    .bind(request_id)
    .bind(&ids)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

async fn replace_alternatives(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    request_id: Uuid,
    alternatives: &[AlternativeInput],
) -> ApiResult<()> {
    sqlx::query("DELETE FROM alternative_products WHERE request_id = $1")
        .bind(request_id)
        .execute(&mut **tx)
        .await?;
    for (i, a) in alternatives.iter().enumerate() {
        sqlx::query(
            "INSERT INTO alternative_products (request_id, position, name, price, url, notes)
             VALUES ($1, $2, $3, $4, $5, $6)",
        )
        .bind(request_id)
        .bind(i as i32)
        .bind(a.name.trim())
        .bind(a.price)
        .bind(clean(&a.url))
        .bind(clean(&a.notes))
        .execute(&mut **tx)
        .await?;
    }
    Ok(())
}

/// プレビューを取得する URL (商品URL と比較商品の URL)
fn preview_urls(input: &RequestInput) -> Vec<String> {
    clean(&input.product_url)
        .into_iter()
        .chain(input.alternatives.iter().filter_map(|a| clean(&a.url)))
        .collect()
}

/// 空文字は未入力 (NULL) として扱う
fn clean(v: &Option<String>) -> Option<String> {
    v.as_deref().map(str::trim).filter(|s| !s.is_empty()).map(str::to_string)
}

/// 画面で href に使うため http(s) 以外 (javascript: 等) は受け付けない
fn validate_url(url: &str, label: &str) -> ApiResult<()> {
    let lower = url.to_ascii_lowercase();
    let ok = (lower.starts_with("https://") || lower.starts_with("http://"))
        && url.len() <= 2000
        && !url.chars().any(|c| c.is_whitespace() || c.is_control());
    if ok {
        Ok(())
    } else {
        Err(ApiError::BadRequest(format!("{label}は http:// または https:// で始まるURLを入力してください")))
    }
}

fn validate_input(input: &RequestInput) -> ApiResult<()> {
    if input.title.trim().is_empty() || input.title.len() > 200 {
        return Err(ApiError::BadRequest("タイトルを入力してください".into()));
    }
    if !(0..=MAX_PRICE).contains(&input.price) {
        return Err(ApiError::BadRequest("金額が正しくありません".into()));
    }
    if input.reason.len() > MAX_TEXT || input.notes.as_deref().map_or(0, str::len) > MAX_TEXT {
        return Err(ApiError::BadRequest("文章が長すぎます".into()));
    }
    if let Some(url) = clean(&input.product_url) {
        validate_url(&url, "URL")?;
    }
    if let (Some(from), Some(to)) = (input.planned_date, input.end_date) {
        if to < from {
            return Err(ApiError::BadRequest("帰る日は行く日以降にしてください".into()));
        }
    }
    if input.alternatives.len() > MAX_ALTERNATIVES {
        return Err(ApiError::BadRequest(format!("比較商品は{MAX_ALTERNATIVES}件までです")));
    }
    for a in &input.alternatives {
        if a.name.trim().is_empty() {
            return Err(ApiError::BadRequest("比較商品の商品名を入力してください".into()));
        }
        if a.price.is_some_and(|p| !(0..=MAX_PRICE).contains(&p)) {
            return Err(ApiError::BadRequest("比較商品の金額が正しくありません".into()));
        }
        if let Some(url) = clean(&a.url) {
            validate_url(&url, "比較商品のURL")?;
        }
    }
    Ok(())
}
