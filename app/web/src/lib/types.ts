export type RequestStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'changes_needed'
  | 'approved'
  | 'merged'
  | 'purchased'
  | 'closed';

export type RequestCategory =
  | 'home' | 'electronics' | 'hobby' | 'travel' | 'education' | 'other' | 'leisure' | 'dining';
/** 稟議の種類: purchase = 買いたいもの / outing = 行きたいところ / activity = やりたいこと */
export type RequestKind = 'purchase' | 'outing' | 'activity';
export const KINDS: RequestKind[] = ['purchase', 'outing', 'activity'];
export type ReviewerDecision = 'pending' | 'approved' | 'changes_requested' | 'rejected';
export type AttachmentKind = 'evidence' | 'receipt';

export interface Member {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  can_request: boolean;
  can_review: boolean;
  is_admin: boolean;
}

export interface FamilyInfo {
  id: string;
  name: string;
  currency: string;
  /** 管理者のときだけ入る */
  invite_code: string | null;
}

/** GET /me */
export interface Me extends Member {
  family: FamilyInfo;
  onboarded: boolean;
}

export interface UserRef {
  id: string;
  name: string;
  avatar_url: string | null;
}

export interface PurchaseRequest {
  id: string;
  requester_id: string;
  kind: RequestKind;
  /** 分岐元の稟議 */
  parent_id: string | null;
  title: string;
  reason: string;
  price: number;
  currency: string;
  seller: string;
  product_name: string | null;
  product_url: string | null;
  category: RequestCategory;
  planned_date: string | null;
  /** お出かけの帰る日 */
  end_date: string | null;
  notes: string | null;
  status: RequestStatus;
  submitted_at: string | null;
  approved_at: string | null;
  merged_at: string | null;
  merged_by: string | null;
  purchased_at: string | null;
  purchase_date: string | null;
  actual_price: number | null;
  order_number: string | null;
  final_product_url: string | null;
  closed_at: string | null;
  close_reason: 'rejected' | 'withdrawn' | null;
  created_at: string;
  updated_at: string;
}

export interface RequestListItem extends PurchaseRequest {
  requester_name: string;
  reviewer_names: string[];
  comment_count: number;
  /** 商品URL のプレビュー画像 ID */
  preview_id: string | null;
  labels: Label[];
}

/** 家族ごとのラベル (GitHub の Labels と同じく、稟議に複数付けられる) */
export interface Label {
  id: string;
  name: string;
  /** #rrggbb */
  color: string;
  description: string;
}

/** リンク先ページのプレビュー (OGP / JSON-LD) */
export interface LinkPreview {
  id: string;
  url: string;
  title: string | null;
  site_name: string | null;
  has_image: boolean;
}

/** プレビュー画像の URL (Web は Cookie 認証付きのプロキシ経由) */
export const previewImagePath = (id: string) => `/link-previews/${id}/image`;

export interface Reviewer extends UserRef {
  decision: ReviewerDecision;
  decided_at: string | null;
}

export interface AlternativeProduct {
  id: string;
  position: number;
  name: string;
  price: number | null;
  url: string | null;
  notes: string | null;
}

export interface Attachment {
  id: string;
  request_id: string;
  kind: AttachmentKind;
  file_name: string;
  content_type: string;
  byte_size: number;
  uploaded_by: string | null;
  created_at: string;
}

export type TimelineEntry =
  | { type: 'comment'; id: string; user: UserRef | null; body: string; created_at: string }
  | {
      type: 'event';
      id: string;
      user: UserRef | null;
      action: string;
      metadata: Record<string, unknown>;
      created_at: string;
    };

export interface Permissions {
  can_edit: boolean;
  can_submit: boolean;
  can_approve: boolean;
  can_request_changes: boolean;
  can_reject: boolean;
  can_merge: boolean;
  can_mark_purchased: boolean;
  can_close: boolean;
  can_delete: boolean;
  can_comment: boolean;
  can_upload_evidence: boolean;
  can_upload_receipt: boolean;
  can_reopen: boolean;
  /** ラベルの付け外し (申請者とレビュアー) */
  can_label: boolean;
}

/** 分岐元・分岐先の稟議 */
export interface RequestRef {
  id: string;
  title: string;
  kind: RequestKind;
  status: RequestStatus;
  requester_name: string;
}

/** GET /requests/:id */
export interface RequestDetail {
  request: PurchaseRequest;
  parent: RequestRef | null;
  children: RequestRef[];
  family_name: string;
  requester: UserRef;
  merged_by: UserRef | null;
  reviewers: Reviewer[];
  labels: Label[];
  alternatives: AlternativeProduct[];
  attachments: Attachment[];
  timeline: TimelineEntry[];
  permissions: Permissions;
  previews: LinkPreview[];
  /** 申請者の家事の実績 (レビューの判断材料) */
  requester_contributions: ContributionSummary;
}

export interface Dashboard {
  currency: string;
  total_requests: number;
  waiting_for_review: number;
  waiting_for_my_review: number;
  approved: number;
  purchased: number;
  total_spending: number;
  /** ラベル別の支出 (label が null なら「ラベルなし」。複数のラベルが付いた稟議は、それぞれに数える) */
  by_label: { label: Label | null; total: number; count: number }[];
}

// ---------------------------------------------------------------------------
// 表示ラベル (日本語)
// ---------------------------------------------------------------------------

export const STATUS_LABEL: Record<RequestStatus, string> = {
  draft: '下書き',
  submitted: 'レビュー待ち',
  under_review: 'レビュー中',
  changes_needed: '修正依頼あり',
  approved: '承認済み',
  merged: 'マージ済み',
  purchased: '購入済み',
  closed: 'クローズ',
};

/** 状態の説明 */
export const STATUS_HINT: Record<RequestStatus, string> = {
  draft: '家族にはまだ見えていません',
  submitted: '家族のレビューを待っています',
  under_review: '家族が確認しています',
  changes_needed: '追加情報・修正が必要です',
  approved: 'マージすると稟議成立です',
  merged: '稟議が成立しました。購入できます',
  purchased: '完了しました',
  closed: '却下または取り下げられました',
};

/** GitHub の PR 状態に対応させた表示グループ (色とアイコンに使う) */
export type StatusGroup = 'draft' | 'open' | 'merged' | 'done' | 'closed';
export const STATUS_GROUP: Record<RequestStatus, StatusGroup> = {
  draft: 'draft',
  submitted: 'open',
  under_review: 'open',
  changes_needed: 'open',
  approved: 'open',
  merged: 'merged',
  purchased: 'done',
  closed: 'closed',
};

export const CATEGORY_LABEL: Record<RequestCategory, string> = {
  home: '家・生活',
  electronics: '家電・ガジェット',
  hobby: '趣味',
  travel: '旅行',
  education: '教育',
  other: 'その他',
  leisure: 'レジャー',
  dining: '外食',
};

// カテゴリは廃止してラベルに移した。CATEGORY_LABEL は、以前の変更履歴 (カテゴリの変更) を表示するためだけに残している

export const KIND_LABEL: Record<RequestKind, string> = {
  purchase: '買い物',
  outing: 'お出かけ',
  activity: 'やりたいこと',
};

export interface KindText {
  icon: string;
  what: string;
  titleExample: string;
  price: string;
  priceShort: string;
  seller: string;
  sellerExample: string;
  sellerRequired: boolean;
  product: string;
  productExample: string;
  productRequired: boolean;
  productUrl: string;
  section: string;
  sectionLink: string;
  date: string;
  hasEndDate: boolean;
  reason: string;
  reasonPlaceholder: string;
  reasonHint: string;
  alternatives: string;
  altName: string;
  altExample: string;
  noAlternatives: string;
  compare: string;
  eyebrow: string;
  thing: string;
  mergeSub: string;
  mergedSub: string;
  waitingDone: string;
  done: string;
  doneSub: string;
  doneEvent: string;
  markDone: string;
  record: string;
  actualPrice: string;
  doneDate: string;
  orderNo: string;
  finalUrl: string;
  receipt: string;
  evidenceHint: string;
}

/**
 * 種類ごとの項目名。データの持ち方は共通で、
 * product_name = 商品名 / 行き先 / やること、seller = 購入先 / 予約先 / 申込先 として使う。
 */
export const KIND_TEXT: Record<RequestKind, KindText> = {
  purchase: {
    icon: '🛍',
    what: '買いたいもの',
    titleExample: '例: 家族旅行用の新しいカメラ',
    price: '金額',
    priceShort: '金額',
    seller: '購入先',
    sellerExample: '例: Amazon',
    sellerRequired: true,
    product: '商品名',
    productExample: '例: ソニー α6400',
    productRequired: false,
    productUrl: '商品URL',
    section: '商品',
    sectionLink: '商品ページを開く',
    date: '購入予定日',
    hasEndDate: false,
    reason: '購入理由',
    reasonPlaceholder: 'なぜ必要ですか？ 何に使いますか？\n今あるものでは何が足りませんか？',
    reasonHint: '「欲しい」だけでなく、なぜ必要か・何に使うか・今の物では何が足りないかを書くと、家族が判断しやすくなります。',
    alternatives: '比較した商品',
    altName: '商品名',
    altExample: '例: 商品A',
    noAlternatives: '他の商品とは比較していません',
    compare: '商品と比較',
    eyebrow: '購入稟議',
    thing: 'この購入',
    mergeSub: '承認を確定して、購入を許可します。',
    mergedSub: '稟議が成立しました。購入して、購入済みにしましょう。',
    waitingDone: '申請者の購入を待っています。',
    done: '購入済み',
    doneSub: '購入が完了しました。',
    doneEvent: '購入済みにしました',
    markDone: '購入済みにする',
    record: '購入情報',
    actualPrice: '購入金額',
    doneDate: '購入日',
    orderNo: '注文番号',
    finalUrl: '購入した商品のURL',
    receipt: 'レシート・領収書',
    evidenceHint: '見積書・レビュー・スクリーンショット',
  },
  outing: {
    icon: '📍',
    what: '行きたいところ',
    titleExample: '例: 週末に水族館へ行きたい',
    price: '予算 (交通費・入場料など)',
    priceShort: '予算',
    seller: '予約先・手配',
    sellerExample: '例: 公式サイトで前売り券',
    sellerRequired: false,
    product: '行き先',
    productExample: '例: 海遊館',
    productRequired: true,
    productUrl: '行き先のURL',
    section: '行き先',
    sectionLink: '行き先のページを開く',
    date: '行く日',
    hasEndDate: true,
    reason: '行きたい理由',
    reasonPlaceholder: 'なぜ行きたいですか？ 誰と行きたいですか？\n家族にとってどんな良いことがありますか？',
    reasonHint: '行きたい理由や、誰と行くか・家族にとっての良いことを書くと、家族が判断しやすくなります。',
    alternatives: '他の候補',
    altName: '候補',
    altExample: '例: 動物園',
    noAlternatives: '他の候補とは比べていません',
    compare: '行き先と候補',
    eyebrow: 'お出かけの稟議',
    thing: 'このお出かけ',
    mergeSub: '承認を確定して、お出かけを決定します。',
    mergedSub: '稟議が成立しました。出かけたら「行ってきた」にしましょう。',
    waitingDone: '申請者の報告を待っています。',
    done: '行ってきた',
    doneSub: 'お出かけが完了しました。',
    doneEvent: '「行ってきた」にしました',
    markDone: '行ってきたにする',
    record: 'お出かけの記録',
    actualPrice: '実際にかかった費用',
    doneDate: '行った日',
    orderNo: '予約番号',
    finalUrl: '行った場所のURL',
    receipt: 'レシート・チケット',
    evidenceHint: 'パンフレット・スクリーンショットなど',
  },
  activity: {
    icon: '✨',
    what: 'やりたいこと',
    titleExample: '例: ピアノを習いたい',
    price: '費用の見込み',
    priceShort: '費用',
    seller: '申込先・場所',
    sellerExample: '例: 駅前の音楽教室',
    sellerRequired: false,
    product: 'やること',
    productExample: '例: 月4回のレッスン (体験から)',
    productRequired: false,
    productUrl: '参考URL',
    section: 'やること',
    sectionLink: '参考ページを開く',
    date: '始める日・やる日',
    hasEndDate: false,
    reason: 'やりたい理由',
    reasonPlaceholder: 'なぜやりたいですか？ 続けられそうですか？\n家族にとってどんな良いことがありますか？',
    reasonHint: 'やりたい理由や、続け方・家族にとっての良いことを書くと、家族が判断しやすくなります。',
    alternatives: '他の案',
    altName: '案',
    altExample: '例: オンラインレッスン',
    noAlternatives: '他の案とは比べていません',
    compare: '内容と他の案',
    eyebrow: 'やりたいことの稟議',
    thing: 'このやりたいこと',
    mergeSub: '承認を確定して、やることを決定します。',
    mergedSub: '稟議が成立しました。やったら「やった」にしましょう。',
    waitingDone: '申請者の報告を待っています。',
    done: 'やった',
    doneSub: 'やりたいことが実現しました。',
    doneEvent: '「やった」にしました',
    markDone: 'やったにする',
    record: 'やったことの記録',
    actualPrice: '実際にかかった費用',
    doneDate: 'やった日',
    orderNo: '申込番号',
    finalUrl: '参考URL',
    receipt: 'レシート・記録',
    evidenceHint: '案内・スクリーンショットなど',
  },
};

/** 種類を考慮した状態ラベル (お出かけの完了は「行ってきた」) */
export function statusLabel(kind: RequestKind, status: RequestStatus): string {
  return status === 'purchased' ? KIND_TEXT[kind].done : STATUS_LABEL[status];
}

export const DECISION_LABEL: Record<ReviewerDecision, string> = {
  pending: '未レビュー',
  approved: '承認',
  changes_requested: '修正依頼',
  rejected: '却下',
};

/** 一覧のフィルター */
export const FILTERS = [
  { key: 'all', label: 'すべて' },
  { key: 'waiting', label: 'レビュー待ち' },
  { key: 'to_review', label: '自分のレビュー待ち' },
  { key: 'mine', label: '自分の申請' },
  { key: 'approved', label: '承認済み' },
  { key: 'purchased', label: '完了' },
  { key: 'closed', label: 'クローズ' },
] as const;

// ---------------------------------------------------------------------------
// 家事のコミット
// ---------------------------------------------------------------------------

export interface Chore {
  id: string;
  name: string;
  icon: string;
  /** どこまでやったらコミットしてよいかなど、家事の内容の説明 (未入力は空文字) */
  description: string;
  /** 所要時間 (分) */
  duration_minutes: number | null;
  /** 推奨頻度: frequency_period あたり frequency_times 回 (未設定は両方 null) */
  frequency_period: FrequencyPeriod | null;
  frequency_times: number | null;
  position: number;
  /** 非表示 (コミットできないが、過去の実績は残る) */
  archived: boolean;
}

/** 家事一覧の 1 行。ログインユーザーの実績付き */
export type FrequencyPeriod = 'day' | 'week' | 'month';
export const FREQUENCY_PERIOD_LABEL: Record<FrequencyPeriod, string> = { day: '1日', week: '週', month: '月' };

/** 家事の見本画像 (きれいな状態 = 保つべき状態を示す写真) */
export interface ChoreImage {
  id: string;
  chore_id: string;
  file_name: string;
  content_type: string;
  byte_size: number;
  /** 画像ごとの説明 (どこを・どういう状態に保つか。未入力は空文字) */
  caption: string;
  position: number;
  created_at: string;
}

export interface ChoreStatus extends Chore {
  committed_today: boolean;
  days: number;
  current_streak: number;
  /** 推奨頻度の今の期間 (今日 / 今週 / 今月) にコミットした日数と、クリアに必要な日数。頻度が未設定なら今日の分 */
  period_done: number;
  period_target: number;
  /** プッシュ済みで、今日のコミットを取り消せない */
  locked: boolean;
  /** 見本画像 (並び順) */
  images: ChoreImage[];
}

/** プッシュの種類。all = 今日すべての家事、それ以外は推奨頻度の期間が同じ家事 */
export type PushScope = 'all' | FrequencyPeriod;

/** トロフィーの種類ごとの数 */
export interface TrophyCount {
  scope: PushScope;
  icon: string;
  label: string;
  count: number;
}

/** 種類ごとのプッシュの状況 (ログインユーザー) */
export interface PushStatus {
  scope: PushScope;
  /** タブの名前 (すべて / 毎日 / 週 / 月) */
  label: string;
  /** 対象の期間 (今日 / 今週 / 今月) */
  period: string;
  period_start: string;
  trophy_icon: string;
  trophy_label: string;
  /** 対象の家事の数と、そのうちクリアした数 */
  total: number;
  done: number;
  can_push: boolean;
  /** 今の期間はプッシュ済み */
  pushed: boolean;
}

export interface Badge {
  key: string;
  icon: string;
  label: string;
}

export interface ContributionDay {
  date: string;
  count: number;
  /** その日にプッシュした (どれかの種類のトロフィーを取った) */
  pushed: boolean;
}

export interface ChoreStat {
  chore_id: string;
  name: string;
  icon: string;
  days: number;
  current_streak: number;
}

/** 1 人分の家事の実績 */
export interface ContributionSummary {
  user_id: string;
  today: string;
  /** コミットした日数 (同じ日に複数の家事をしても 1 日) */
  total_days: number;
  total_commits: number;
  /** 直近 30 日でコミットした日数 */
  last_30_days: number;
  /** 今日 (まだなら昨日) まで続いている連続日数 */
  current_streak: number;
  longest_streak: number;
  committed_today: boolean;
  /** プッシュして取ったトロフィーの数 (すべての種類の合計。取り消せない実績) */
  trophies: number;
  /** トロフィーの種類ごとの数 (すべて / 毎日 / 週 / 月 の順) */
  trophy_counts: TrophyCount[];
  /** 今日「すべて」をプッシュした */
  pushed_today: boolean;
  badges: Badge[];
  /** 直近 12 週 (日曜始まり) の日別件数 */
  calendar: ContributionDay[];
  by_chore: ChoreStat[];
}

export interface ChoresResp {
  today: string;
  chores: ChoreStatus[];
  /** 今日の家事 (非表示を除く) をすべてコミットしていて、まだプッシュしていない (pushes の all と同じ) */
  can_push: boolean;
  /** 種類ごとのプッシュの状況 (すべて / 毎日 / 週 / 月 の順) */
  pushes: PushStatus[];
  me: ContributionSummary;
  members: { user: UserRef; summary: ContributionSummary }[];
}

/** ラベルの色 (#rrggbb) の上で読みやすい文字色 (白か黒) */
export function labelTextColor(color: string): string {
  const n = parseInt(color.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  // 相対輝度 (sRGB の近似) が明るければ黒文字
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#1f2328' : '#ffffff';
}
