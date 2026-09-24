use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/// Draft → Submitted → Under Review ⇄ Changes Needed → Approved → Merged → Purchased
/// (いつでも Closed = 却下・取り下げ)
#[derive(Debug, Clone, Copy, Serialize, Deserialize, sqlx::Type, PartialEq, Eq)]
#[sqlx(type_name = "request_status", rename_all = "snake_case")]
#[serde(rename_all = "snake_case")]
pub enum RequestStatus {
    Draft,
    Submitted,
    UnderReview,
    ChangesNeeded,
    Approved,
    Merged,
    Purchased,
    Closed,
}

impl RequestStatus {
    /// Requester が内容を編集できる状態
    pub fn is_editable(self) -> bool {
        matches!(self, Self::Draft | Self::ChangesNeeded)
    }
    /// Reviewer の判定待ち
    pub fn is_in_review(self) -> bool {
        matches!(self, Self::Submitted | Self::UnderReview)
    }
    pub fn is_finished(self) -> bool {
        matches!(self, Self::Purchased | Self::Closed)
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, sqlx::Type, PartialEq, Eq)]
#[sqlx(type_name = "request_category", rename_all = "snake_case")]
#[serde(rename_all = "snake_case")]
pub enum RequestCategory {
    Home,
    Electronics,
    Hobby,
    Travel,
    Education,
    Other,
    Leisure,
    Dining,
}

/// 稟議の種類。流れは同じで、画面の項目名と申請時の必須項目が変わる。
#[derive(Debug, Clone, Copy, Serialize, Deserialize, sqlx::Type, PartialEq, Eq, Default)]
#[sqlx(type_name = "request_kind", rename_all = "snake_case")]
#[serde(rename_all = "snake_case")]
pub enum RequestKind {
    /// 買いたいもの
    #[default]
    Purchase,
    /// 行きたいところ
    Outing,
    /// やりたいこと
    Activity,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, sqlx::Type, PartialEq, Eq)]
#[sqlx(type_name = "reviewer_decision", rename_all = "snake_case")]
#[serde(rename_all = "snake_case")]
pub enum ReviewerDecision {
    Pending,
    Approved,
    ChangesRequested,
    Rejected,
}

/// evidence = 購入判断のための資料 (見積書・カタログ等), receipt = 購入後のレシート・領収書
#[derive(Debug, Clone, Copy, Serialize, Deserialize, sqlx::Type, PartialEq, Eq)]
#[sqlx(type_name = "attachment_kind", rename_all = "snake_case")]
#[serde(rename_all = "snake_case")]
pub enum AttachmentKind {
    Evidence,
    Receipt,
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct Family {
    pub id: Uuid,
    pub name: String,
    pub invite_code: String,
    pub currency: String,
}

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct User {
    pub id: Uuid,
    pub password_hash: String,
}

/// ログインユーザー / 家族メンバー。権限は毎リクエスト DB から読むので変更が即時に反映される。
#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct Member {
    pub id: Uuid,
    #[serde(skip_serializing)]
    pub family_id: Uuid,
    pub email: String,
    pub name: String,
    pub avatar_url: Option<String>,
    pub can_request: bool,
    pub can_review: bool,
    pub is_admin: bool,
}

/// 画面表示用の最小限のユーザー情報
#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct UserRef {
    pub id: Uuid,
    pub name: String,
    pub avatar_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct PurchaseRequest {
    pub id: Uuid,
    #[serde(skip_serializing)]
    pub family_id: Uuid,
    pub requester_id: Uuid,
    pub kind: RequestKind,
    /// 分岐元の稟議
    pub parent_id: Option<Uuid>,
    pub title: String,
    pub reason: String,
    pub price: i64,
    pub currency: String,
    pub seller: String,
    pub product_name: Option<String>,
    pub product_url: Option<String>,
    pub category: RequestCategory,
    pub planned_date: Option<NaiveDate>,
    /// お出かけの帰る日 (日帰りなら None)
    pub end_date: Option<NaiveDate>,
    pub notes: Option<String>,
    pub status: RequestStatus,
    pub submitted_at: Option<DateTime<Utc>>,
    pub approved_at: Option<DateTime<Utc>>,
    pub merged_at: Option<DateTime<Utc>>,
    pub merged_by: Option<Uuid>,
    pub purchased_at: Option<DateTime<Utc>>,
    pub purchase_date: Option<NaiveDate>,
    pub actual_price: Option<i64>,
    pub order_number: Option<String>,
    pub final_product_url: Option<String>,
    pub closed_at: Option<DateTime<Utc>>,
    /// rejected / withdrawn
    pub close_reason: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// 一覧用。申請者名・Reviewer 名・コメント数を付ける。
#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct RequestListItem {
    #[serde(flatten)]
    #[sqlx(flatten)]
    pub request: PurchaseRequest,
    pub requester_name: String,
    pub reviewer_names: Vec<String>,
    pub comment_count: i64,
    /// 商品URL のプレビュー画像 (GET /link-previews/:id/image)
    pub preview_id: Option<Uuid>,
    pub labels: sqlx::types::Json<Vec<Label>>,
}

/// 家族ごとのラベル (GitHub の Labels と同じく、稟議に複数付けられる)
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Label {
    pub id: Uuid,
    pub name: String,
    /// #rrggbb
    pub color: String,
    pub description: String,
}

#[derive(Debug, Deserialize)]
pub struct LabelInput {
    pub name: String,
    pub color: String,
    pub description: Option<String>,
}

/// 稟議に付けるラベル (この集合に置き換える)
#[derive(Debug, Deserialize)]
pub struct RequestLabelsInput {
    pub label_ids: Vec<Uuid>,
}

/// リンク先ページのプレビュー
#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct LinkPreview {
    pub id: Uuid,
    pub url: String,
    pub title: Option<String>,
    pub site_name: Option<String>,
    pub has_image: bool,
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct Reviewer {
    pub id: Uuid,
    pub name: String,
    pub avatar_url: Option<String>,
    pub decision: ReviewerDecision,
    pub decided_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct AlternativeProduct {
    pub id: Uuid,
    pub position: i32,
    pub name: String,
    pub price: Option<i64>,
    pub url: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct Attachment {
    pub id: Uuid,
    pub request_id: Uuid,
    pub kind: AttachmentKind,
    pub file_name: String,
    pub content_type: String,
    pub byte_size: i64,
    #[serde(skip_serializing)]
    pub storage_key: String,
    pub uploaded_by: Option<Uuid>,
    pub created_at: DateTime<Utc>,
}

/// Activity 欄。コメントと操作履歴を時系列に並べたもの。
#[derive(Debug, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum TimelineEntry {
    Comment {
        id: Uuid,
        user: Option<UserRef>,
        body: String,
        created_at: DateTime<Utc>,
    },
    Event {
        id: Uuid,
        user: Option<UserRef>,
        action: String,
        metadata: serde_json::Value,
        created_at: DateTime<Utc>,
    },
}

impl TimelineEntry {
    pub fn created_at(&self) -> DateTime<Utc> {
        match self {
            Self::Comment { created_at, .. } | Self::Event { created_at, .. } => *created_at,
        }
    }
}

/// 画面のボタン表示に使う、ログインユーザーが今できる操作
#[derive(Debug, Serialize, Default)]
pub struct Permissions {
    pub can_edit: bool,
    pub can_submit: bool,
    pub can_approve: bool,
    pub can_request_changes: bool,
    pub can_reject: bool,
    pub can_merge: bool,
    pub can_mark_purchased: bool,
    pub can_close: bool,
    pub can_delete: bool,
    pub can_comment: bool,
    pub can_upload_evidence: bool,
    pub can_upload_receipt: bool,
    pub can_reopen: bool,
    /// ラベルの付け外し (申請者とレビュアー)
    pub can_label: bool,
}

/// 分岐元・分岐先の表示用
#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct RequestRef {
    pub id: Uuid,
    pub title: String,
    pub kind: RequestKind,
    pub status: RequestStatus,
    pub requester_name: String,
}

#[derive(Debug, Serialize)]
pub struct RequestDetail {
    pub request: PurchaseRequest,
    /// 分岐元
    pub parent: Option<RequestRef>,
    /// この稟議から分岐した稟議
    pub children: Vec<RequestRef>,
    pub family_name: String,
    pub requester: UserRef,
    pub merged_by: Option<UserRef>,
    pub reviewers: Vec<Reviewer>,
    pub labels: Vec<Label>,
    pub alternatives: Vec<AlternativeProduct>,
    pub attachments: Vec<Attachment>,
    pub timeline: Vec<TimelineEntry>,
    pub permissions: Permissions,
    /// 商品URL・比較商品の URL などのプレビュー (取得できたものだけ)
    pub previews: Vec<LinkPreview>,
    /// 申請者の家事の実績 (レビューの判断材料)
    pub requester_contributions: ContributionSummary,
}

// ---------------------------------------------------------------------------
// 家事のコミット
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct Chore {
    pub id: Uuid,
    pub name: String,
    pub icon: String,
    /// どこまでやったらコミットしてよいかなど、家事の内容の説明 (未入力は空文字)
    pub description: String,
    /// 所要時間 (分)
    pub duration_minutes: Option<i32>,
    /// 推奨頻度: frequency_period (day / week / month) あたり frequency_times 回。両方そろっているときだけ有効
    pub frequency_period: Option<String>,
    pub frequency_times: Option<i32>,
    pub position: i32,
    /// 非表示 (コミットできないが、過去の実績は残る)
    pub archived: bool,
}

/// 家事の見本画像 (きれいな状態 = 保つべき状態を示す写真)
#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct ChoreImage {
    pub id: Uuid,
    pub chore_id: Uuid,
    pub file_name: String,
    pub content_type: String,
    pub byte_size: i64,
    #[serde(skip_serializing)]
    pub storage_key: String,
    /// 画像ごとの説明 (どこを・どういう状態に保つか。未入力は空文字)
    pub caption: String,
    pub position: i32,
    pub created_at: DateTime<Utc>,
}

/// 家事の並び順。家族の家事 (非表示を含む) の ID を、表示したい順にすべて並べる
#[derive(Debug, Deserialize)]
pub struct ChoreOrder {
    pub ids: Vec<Uuid>,
}

#[derive(Debug, Deserialize)]
pub struct ChoreImageUpdate {
    pub caption: String,
}

/// 家事一覧の 1 行。ログインユーザーの実績付き。
#[derive(Debug, Serialize)]
pub struct ChoreStatus {
    #[serde(flatten)]
    pub chore: Chore,
    /// 見本画像 (並び順)
    pub images: Vec<ChoreImage>,
    pub committed_today: bool,
    /// この家事をコミットした日数
    pub days: i64,
    pub current_streak: i64,
    /// 推奨頻度の今の期間 (今日 / 今週 / 今月) にコミットした日数と、クリアに必要な日数。頻度が未設定なら今日の分 (0 か 1 / 1)
    pub period_done: i64,
    pub period_target: i64,
    /// プッシュ済みで、今日のコミットを取り消せない
    pub locked: bool,
}

/// プッシュして取ったトロフィーの、種類 (scope) ごとの数
#[derive(Debug, Clone, Serialize)]
pub struct TrophyCount {
    pub scope: &'static str,
    pub icon: &'static str,
    pub label: &'static str,
    pub count: i64,
}

/// 種類 (scope) ごとのプッシュの状況 (ログインユーザー)
#[derive(Debug, Serialize)]
pub struct PushStatus {
    /// all = 今日すべて / day = 毎日の家事 / week = 週の家事 / month = 月の家事
    pub scope: &'static str,
    /// タブの名前 (すべて / 毎日 / 週 / 月)
    pub label: &'static str,
    /// 対象の期間 (今日 / 今週 / 今月)
    pub period: &'static str,
    pub period_start: NaiveDate,
    pub trophy_icon: &'static str,
    pub trophy_label: &'static str,
    /// 対象の家事の数と、そのうちクリアした数
    pub total: i64,
    pub done: i64,
    pub can_push: bool,
    /// 今の期間はプッシュ済み
    pub pushed: bool,
}

#[derive(Debug, Default, Deserialize)]
pub struct PushInput {
    /// 省略時は all (以前のアプリは本文 {} で送ってくる)
    #[serde(default)]
    pub scope: Option<String>,
}

/// 連続記録・累計日数で付くマーク
#[derive(Debug, Clone, Serialize)]
pub struct Badge {
    pub key: &'static str,
    pub icon: &'static str,
    pub label: &'static str,
}

/// 草グラフの 1 マス
#[derive(Debug, Clone, Serialize)]
pub struct ContributionDay {
    pub date: NaiveDate,
    pub count: i64,
    /// その日にプッシュした (どれかの種類のトロフィーを取った)
    pub pushed: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct ChoreStat {
    pub chore_id: Uuid,
    pub name: String,
    pub icon: String,
    pub days: i64,
    pub current_streak: i64,
}

/// 1 人分の家事の実績
#[derive(Debug, Clone, Serialize)]
pub struct ContributionSummary {
    pub user_id: Uuid,
    pub today: NaiveDate,
    /// コミットした日数 (同じ日に複数の家事をしても 1 日)
    pub total_days: i64,
    pub total_commits: i64,
    /// 直近 30 日でコミットした日数
    pub last_30_days: i64,
    /// 今日 (まだなら昨日) まで続いている連続日数
    pub current_streak: i64,
    pub longest_streak: i64,
    pub committed_today: bool,
    /// プッシュして取ったトロフィーの数 (すべての種類の合計。取り消せない実績)
    pub trophies: i64,
    /// トロフィーの種類ごとの数 (すべて / 毎日 / 週 / 月 の順)
    pub trophy_counts: Vec<TrophyCount>,
    /// 今日「すべて」をプッシュした
    pub pushed_today: bool,
    pub badges: Vec<Badge>,
    /// 直近 12 週 (日曜始まり) の日別件数
    pub calendar: Vec<ContributionDay>,
    pub by_chore: Vec<ChoreStat>,
}

#[derive(Debug, Serialize)]
pub struct MemberContribution {
    pub user: UserRef,
    pub summary: ContributionSummary,
}

#[derive(Debug, Serialize)]
pub struct ChoresResp {
    pub today: NaiveDate,
    pub chores: Vec<ChoreStatus>,
    /// 今日の家事 (非表示を除く) をすべてコミットしていて、まだプッシュしていない (pushes の all と同じ)
    pub can_push: bool,
    /// 種類ごとのプッシュの状況 (すべて / 毎日 / 週 / 月 の順)
    pub pushes: Vec<PushStatus>,
    /// ログインユーザーの実績
    pub me: ContributionSummary,
    pub members: Vec<MemberContribution>,
}

#[derive(Debug, Deserialize)]
pub struct ChoreInput {
    pub name: String,
    pub icon: Option<String>,
    pub description: Option<String>,
    pub duration_minutes: Option<i32>,
    pub frequency_period: Option<String>,
    pub frequency_times: Option<i32>,
    #[serde(default)]
    pub archived: bool,
}

// ---------------------------------------------------------------------------
// API I/O
// ---------------------------------------------------------------------------

/// 登録は「家族を新しく作る (family_name)」か「招待コードで参加 (invite_code)」のどちらか。
#[derive(Debug, Deserialize)]
pub struct RegisterReq {
    pub email: String,
    pub password: String,
    pub name: String,
    pub family_name: Option<String>,
    pub invite_code: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct LoginReq {
    pub email: String,
    pub password: String,
}

#[derive(Debug, Serialize)]
pub struct AuthResp {
    pub token: String,
    pub user: Member,
}

#[derive(Debug, Serialize)]
pub struct FamilyInfo {
    pub id: Uuid,
    pub name: String,
    pub currency: String,
    /// 管理者にだけ返す
    pub invite_code: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct MeResp {
    #[serde(flatten)]
    pub member: Member,
    pub family: FamilyInfo,
    /// 初回オンボーディングを見終えたか
    pub onboarded: bool,
}

#[derive(Debug, Deserialize)]
pub struct FamilyUpdate {
    pub name: String,
}

#[derive(Debug, Deserialize)]
pub struct MemberUpdate {
    pub can_request: bool,
    pub can_review: bool,
    pub is_admin: bool,
}

#[derive(Debug, Deserialize)]
pub struct AlternativeInput {
    pub name: String,
    pub price: Option<i64>,
    pub url: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct RequestInput {
    #[serde(default)]
    pub kind: RequestKind,
    /// 分岐元 (作成時のみ有効。更新では無視する)
    #[serde(default)]
    pub parent_id: Option<Uuid>,
    pub title: String,
    #[serde(default)]
    pub reason: String,
    pub price: i64,
    #[serde(default)]
    pub seller: String,
    pub product_name: Option<String>,
    pub product_url: Option<String>,
    /// 以前のカテゴリ。今はラベルで分類するので画面からは送らない (作成時は other、更新時は変えない)
    #[serde(default)]
    pub category: Option<RequestCategory>,
    pub planned_date: Option<NaiveDate>,
    pub end_date: Option<NaiveDate>,
    pub notes: Option<String>,
    #[serde(default)]
    pub reviewer_ids: Vec<Uuid>,
    /// 付けるラベル (この集合に置き換える)。省略時はラベルを変えない
    #[serde(default)]
    pub label_ids: Option<Vec<Uuid>>,
    #[serde(default)]
    pub alternatives: Vec<AlternativeInput>,
}

#[derive(Debug, Deserialize)]
pub struct CommentInput {
    pub body: String,
}

/// Approve / Request Changes / Reject / Close に添えるコメント
#[derive(Debug, Deserialize, Default)]
pub struct ActionInput {
    pub comment: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct PurchaseInput {
    pub actual_price: i64,
    pub purchase_date: NaiveDate,
    pub order_number: Option<String>,
    pub final_product_url: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ListQuery {
    /// all / waiting / to_review / mine / approved / purchased / closed
    pub filter: Option<String>,
    /// 種類で絞り込む (省略時はすべて)
    pub kind: Option<RequestKind>,
    /// ラベルで絞り込む
    pub label: Option<Uuid>,
}

/// ラベル別の支出。label が None なら「ラベルなし」
#[derive(Debug, Serialize)]
pub struct LabelTotal {
    pub label: Option<Label>,
    pub total: i64,
    pub count: i64,
}

#[derive(Debug, Serialize)]
pub struct Dashboard {
    pub currency: String,
    pub total_requests: i64,
    pub waiting_for_review: i64,
    pub waiting_for_my_review: i64,
    pub approved: i64,
    pub purchased: i64,
    /// 購入済み申請の実額合計
    pub total_spending: i64,
    /// ラベル別の支出 (複数のラベルが付いた稟議は、それぞれのラベルに数える)
    pub by_label: Vec<LabelTotal>,
}
