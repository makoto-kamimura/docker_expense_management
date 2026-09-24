// Web (app/web/src/lib/format.ts) と同じ表示ロジック
import {
  CATEGORY_LABEL,
  KIND_LABEL,
  KIND_TEXT,
  FREQUENCY_PERIOD_LABEL,
  type Chore,
  type ChoreStatus,
  type FrequencyPeriod,
  type ContributionSummary,
  type RequestCategory,
  type RequestDetail,
  type RequestKind,
  type TimelineEntry,
} from './types';

export function money(amount: number | null | undefined, currency = 'JPY'): string {
  if (amount == null) return '—';
  try {
    return new Intl.NumberFormat('ja-JP', { style: 'currency', currency }).format(amount);
  } catch {
    return `${amount.toLocaleString()} ${currency}`;
  }
}

export function fmtDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** 「3日前」のような相対時刻 */
export function timeAgo(iso: string, now = Date.now()): string {
  const sec = Math.round((now - new Date(iso).getTime()) / 1000);
  const units: [number, string][] = [
    [60 * 60 * 24 * 365, '年'],
    [60 * 60 * 24 * 30, 'か月'],
    [60 * 60 * 24, '日'],
    [60 * 60, '時間'],
    [60, '分'],
  ];
  for (const [size, unit] of units) {
    if (sec >= size) return `${Math.floor(sec / size)}${unit}前`;
  }
  return 'たった今';
}

export function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export const isImage = (contentType: string) =>
  contentType.startsWith('image/') && !contentType.includes('svg') && !contentType.includes('hei');
export const isPdf = (contentType: string) => contentType === 'application/pdf';

const FIELD_LABEL: Record<string, string> = {
  title: 'タイトル',
  reason: '購入理由',
  price: '金額',
  seller: '購入先',
  product: '商品名',
  'product link': '商品URL',
  category: 'カテゴリ',
  labels: 'ラベル',
  'purchase date': '予定日',
  'end date': '帰る日',
  kind: '種類',
  notes: 'メモ',
  reviewers: 'レビュアー',
  alternatives: '比較商品',
};

/** Activity の操作を文章にする (memo.md §28) */
export function describeEvent(e: Extract<TimelineEntry, { type: 'event' }>, kind: RequestKind = 'purchase'): string {
  const who = e.user?.name ?? '退会したメンバー';
  switch (e.action) {
    case 'created':
      return e.metadata.parent_title
        ? `${who} が「${e.metadata.parent_title}」から分岐して作成しました`
        : `${who} がこの申請を作成しました`;
    case 'branched': return `${who} がこの稟議から「${e.metadata.child_title ?? '新しい稟議'}」を分岐しました`;
    case 'submitted': return `${who} がレビューを依頼しました${choreNote(e.metadata)}`;
    case 'resubmitted': return `${who} が修正して再度レビューを依頼しました${choreNote(e.metadata)}`;
    case 'started_review': return `${who} がレビューを開始しました`;
    case 'changes_requested': return `${who} が修正を依頼しました`;
    case 'approved': return `${who} が承認しました`;
    case 'rejected': return `${who} が却下しました`;
    case 'merged': return `${who} がマージしました`;
    case 'purchased': return `${who} が${KIND_TEXT[kind].doneEvent}`;
    case 'withdrawn': return `${who} が申請を取り下げました`;
    case 'reopened': return `${who} が再オープンしました`;
    case 'updated': {
      const fields = ((e.metadata.fields as string[] | undefined) ?? []).map((f) => fieldLabel(f, kind));
      return `${who} が${fields.length ? `${fields.join('・')}を` : '内容を'}更新しました`;
    }
    case 'labeled': {
      const names = (key: string) => ((e.metadata[key] as string[] | undefined) ?? []).map((n) => `「${n}」`).join('');
      const added = names('added');
      const removed = names('removed');
      return `${who} がラベル${[added && `${added}を付け`, removed && `${removed}を外し`].filter(Boolean).join('、')}ました`;
    }
    case 'attachment_added': return `${who} が ${e.metadata.file_name ?? 'ファイル'} を添付しました`;
    case 'attachment_removed': return `${who} が ${e.metadata.file_name ?? 'ファイル'} を削除しました`;
    default: return `${who}: ${e.action}`;
  }
}

export interface Checkpoint {
  ok: boolean;
  label: string;
}

/** レビュアーが確認すべき点を申請内容から洗い出す (Summary / 詳細で使用) */
export function checkpoints(d: RequestDetail): Checkpoint[] {
  const r = d.request;
  const evidence = d.attachments.filter((a) => a.kind === 'evidence');
  const t = KIND_TEXT[r.kind];
  const n = d.alternatives.length;
  return [
    r.reason.trim().length >= 20
      ? { ok: true, label: `${t.reason}が説明されています` }
      : { ok: false, label: `${t.reason}が短めです。理由を聞いてみましょう` },
    r.product_url
      ? { ok: true, label: `${t.productUrl}があります` }
      : { ok: false, label: `${t.productUrl}がありません` },
    n > 0
      ? { ok: true, label: `${n}件の${t.altName}と比べています` }
      : { ok: false, label: t.noAlternatives },
    evidence.length > 0
      ? { ok: true, label: `資料が${evidence.length}件添付されています` }
      : { ok: false, label: `資料 (${t.evidenceHint}) がありません` },
    choreCheckpoint(d.requester_contributions),
  ];
}

/** 家事の実績がこれ以上なら「最近コミットしている」とみなす */
export const CHORE_GOOD_DAYS_30 = 10;
export const CHORE_GOOD_STREAK = 3;

/** 申請者の家事の実績をレビューのチェックポイントにする */
function choreCheckpoint(c: ContributionSummary): Checkpoint {
  const detail = `直近30日で${c.last_30_days}日・連続${c.current_streak}日`;
  return c.last_30_days >= CHORE_GOOD_DAYS_30 || c.current_streak >= CHORE_GOOD_STREAK
    ? { ok: true, label: `申請者は最近家事をコミットしています (${detail})` }
    : { ok: false, label: `申請者の家事のコミットは少なめです (${detail})` };
}

/** 申請時点の家事の実績 (activities.metadata.chores) を添える */
function choreNote(metadata: Record<string, unknown>): string {
  const c = metadata.chores as { current_streak?: number; last_30_days?: number } | undefined;
  if (!c) return '';
  return ` (申請時の家事: 連続${c.current_streak ?? 0}日・直近30日で${c.last_30_days ?? 0}日)`;
}

/** 行く日〜帰る日を表示用にまとめる */
export function dateRange(from: string | null, to: string | null): string {
  if (!from) return '—';
  return to && to !== from ? `${from} 〜 ${to}` : from;
}

/** 変更履歴の 1 項目 (API の activities.metadata.changes) */
export interface FieldChange {
  field: string;
  before: unknown;
  after: unknown;
}

/** 変更履歴の項目名 (種類に合わせる) */
export function fieldLabel(field: string, kind: RequestKind): string {
  const t = KIND_TEXT[kind];
  switch (field) {
    case 'seller': return t.seller;
    case 'product': return t.product;
    case 'product link': return t.productUrl;
    case 'purchase date': return t.date;
    case 'price': return t.priceShort;
    case 'reason': return t.reason;
    case 'alternatives': return t.alternatives;
    default: return FIELD_LABEL[field] ?? field;
  }
}

/** 変更前・変更後の値を表示用の文字列にする */
export function formatChangeValue(field: string, v: unknown, currency = 'JPY'): string {
  if (v == null || v === '' || (Array.isArray(v) && v.length === 0)) return '(なし)';
  switch (field) {
    case 'price':
      return money(Number(v), currency);
    case 'kind':
      return KIND_LABEL[v as RequestKind] ?? String(v);
    case 'category':
      return CATEGORY_LABEL[v as RequestCategory] ?? String(v);
    case 'reviewers':
    case 'labels':
      return (v as string[]).join('、');
    case 'alternatives':
      return (v as { name: string; price: number | null }[])
        .map((a) => (a.price != null ? `${a.name} (${money(a.price, currency)})` : a.name))
        .join('、');
    default:
      return String(v);
  }
}

/** 家事の所要時間 (例: 20分 / 1時間30分) */
export function durationLabel(minutes: number | null): string | null {
  if (!minutes) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}時間${m ? `${m}分` : ''}` : `${m}分`;
}

/** 家事の推奨頻度 (例: 毎日 / 1日2回 / 週2回 / 月1回) */
export function frequencyLabel(c: Pick<Chore, 'frequency_period' | 'frequency_times'>): string | null {
  if (!c.frequency_period || !c.frequency_times) return null;
  if (c.frequency_period === 'day' && c.frequency_times === 1) return '毎日';
  return `${FREQUENCY_PERIOD_LABEL[c.frequency_period]}${c.frequency_times}回`;
}

/** 週 / 月の家事の、今の期間の進み具合 (例: 今週 1/2回)。毎日・頻度なしの家事は null */
export function periodProgressLabel(c: Pick<ChoreStatus, 'frequency_period' | 'period_done' | 'period_target'>): string | null {
  if (c.frequency_period !== 'week' && c.frequency_period !== 'month') return null;
  const done = Math.min(c.period_done, c.period_target);
  return `${c.frequency_period === 'week' ? '今週' : '今月'} ${done}/${c.period_target}回${done >= c.period_target ? ' ✓' : ''}`;
}

/** 所要時間と推奨頻度をまとめた 1 行 (どちらも未設定なら null) */
export function choreScheduleLabel(c: Chore): string | null {
  const d = durationLabel(c.duration_minutes);
  const f = frequencyLabel(c);
  if (!d && !f) return null;
  return [d && `⏱ ${d}`, f && `🔁 ${f}`].filter(Boolean).join(' · ');
}

/** 「今日の家事」を推奨頻度で切り替えるタブ。all 以外は頻度の期間 (毎日 / 週 / 月) が一致する家事だけ */
export type ChorePeriodTab = 'all' | FrequencyPeriod;
export const CHORE_PERIOD_TABS: { key: ChorePeriodTab; label: string }[] = [
  { key: 'all', label: 'すべて' },
  { key: 'day', label: '毎日' },
  { key: 'week', label: '週' },
  { key: 'month', label: '月' },
];

export function isChorePeriodTab(v: unknown): v is ChorePeriodTab {
  return CHORE_PERIOD_TABS.some((t) => t.key === v);
}

export function filterByPeriod<T extends Chore>(chores: T[], tab: ChorePeriodTab): T[] {
  return tab === 'all' ? chores : chores.filter((c) => c.frequency_period === tab);
}

/**
 * 表示している家事の所要時間の合計。
 * once = 1 回ずつやった場合の合計。perPeriod = 回数も掛けた、その期間 (1日 / 週 / 月) あたりの合計 (タブが all のときは null)。
 * missing = 所要時間が未設定で合計に入っていない家事の数。
 */
export function choreTimeTotal(chores: Chore[], tab: ChorePeriodTab): { once: number; perPeriod: number | null; missing: number } {
  const timed = chores.filter((c) => c.duration_minutes);
  return {
    once: timed.reduce((sum, c) => sum + (c.duration_minutes ?? 0), 0),
    perPeriod: tab === 'all' ? null : timed.reduce((sum, c) => sum + (c.duration_minutes ?? 0) * (c.frequency_times ?? 1), 0),
    missing: chores.length - timed.length,
  };
}

/** 例: 「合計 45分 · 週あたり 1時間30分 (所要時間が未設定の家事 1件は含まない)」 */
export function choreTimeTotalLabel(chores: Chore[], tab: ChorePeriodTab): string {
  if (chores.length === 0) return '';
  const t = choreTimeTotal(chores, tab);
  if (t.once === 0) return '所要時間はまだ設定されていません';
  const per = t.perPeriod != null && tab !== 'all' && t.perPeriod !== t.once
    ? ` · ${FREQUENCY_PERIOD_LABEL[tab]}あたり ${durationLabel(t.perPeriod)}`
    : '';
  const missing = t.missing ? ` (所要時間が未設定の${t.missing}件は含まない)` : '';
  return `合計 ⏱ ${durationLabel(t.once)}${per}${missing}`;
}

