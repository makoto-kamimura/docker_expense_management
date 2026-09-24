import Link from 'next/link';
import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { getCurrentUser } from '@/lib/session';
import { money, timeAgo } from '@/lib/format';
import { FILTERS, KINDS, KIND_LABEL, KIND_TEXT, STATUS_GROUP, statusLabel, type Label, type RequestKind, type RequestListItem } from '@/lib/types';
import LabelChip from '@/components/LabelChip';
import Octicon, { statusIcon } from '@/components/Octicon';
import { Thumb } from '@/components/LinkCard';

const EMPTY_TEXT: Record<string, string> = {
  all: 'まだ稟議がありません',
  waiting: 'レビュー待ちの稟議はありません',
  to_review: 'あなたのレビュー待ちはありません 🎉',
  mine: 'あなたの稟議はまだありません',
  approved: '承認済みの稟議はありません',
  purchased: '完了した稟議はありません',
  closed: 'クローズした稟議はありません',
};

/** 申請番号 (ID の先頭 7 桁)。GitHub の #123 の代わり */
const shortId = (id: string) => id.slice(0, 7);

export default async function Home({ searchParams }: { searchParams: { filter?: string; kind?: string; label?: string } }) {
  const user = await getCurrentUser();
  if (!user) return <Landing />;
  if (!user.onboarded) redirect('/onboarding');

  const filter = FILTERS.some((f) => f.key === searchParams.filter) ? searchParams.filter! : 'all';
  const kind: RequestKind | null = KINDS.includes(searchParams.kind as RequestKind) ? (searchParams.kind as RequestKind) : null;
  // ラベルでの絞り込みは、家族のラベルに実在する ID のときだけ使う
  const labels = await apiFetch<Label[]>('/labels');
  const label = labels.find((l) => l.id === searchParams.label) ?? null;
  const qs = new URLSearchParams({ filter });
  if (kind) qs.set('kind', kind);
  if (label) qs.set('label', label.id);
  const items = await apiFetch<RequestListItem[]>(`/requests?${qs}`);
  // フィルター・種類・ラベルを組み合わせたリンク
  const href = (f: string, k: RequestKind | null, l: string | null = label?.id ?? null) => {
    const q = new URLSearchParams();
    if (f !== 'all') q.set('filter', f);
    if (k) q.set('kind', k);
    if (l) q.set('label', l);
    return q.toString() ? `/?${q}` : '/';
  };

  return (
    <div>
      <div className="list-head">
        <h1>{filter === 'to_review' ? 'レビュー' : '稟議'}</h1>
        {user.can_request && (
          // 種類 (買いたいもの / 行きたいところ / やりたいこと) はフォームで選ぶ
          <Link className="btn btn-primary" href={kind ? `/requests/new?kind=${kind}` : '/requests/new'}>新しいプロジェクト</Link>
        )}
      </div>

      <div className="box">
        <div className="box-head">
          <nav className="filters" aria-label="稟議の絞り込み">
            {FILTERS.map((f) => (
              <Link key={f.key} href={href(f.key, kind)} className={f.key === filter ? 'on' : ''}>
                {f.label}
              </Link>
            ))}
          </nav>
          <nav className="filters" aria-label="種類で絞り込み">
            {([null, ...KINDS] as (RequestKind | null)[]).map((k) => (
              <Link key={k ?? 'any'} href={href(filter, k)} className={k === kind ? 'on' : ''}>
                {k ? KIND_LABEL[k] : 'すべての種類'}
              </Link>
            ))}
            <span className="muted small">{items.length} 件</span>
          </nav>
        </div>
        {label && (
          <div className="box-row label-filter">
            <span className="muted small">ラベル:</span>
            <LabelChip label={label} />
            <Link href={href(filter, kind, null)} className="small">× 絞り込みを解除</Link>
          </div>
        )}
        {items.length === 0 ? (
          <div className="empty">
            <Octicon name="pr" size={24} />
            <h3>{EMPTY_TEXT[filter]}</h3>
            {filter === 'all' && user.can_request && (
              <Link className="btn btn-primary" href="/requests/new">最初の稟議を作成</Link>
            )}
          </div>
        ) : (
          items.map((r) => (
            <div key={r.id} className="req-item">
              <span className={`icon-${STATUS_GROUP[r.status]}`} title={statusLabel(r.kind, r.status)}>
                <Octicon name={statusIcon(r.status)} />
              </span>
              <div className="req-main">
                <Link href={`/requests/${r.id}`} className="req-title">{r.title}</Link>
                {r.kind !== 'purchase' && <span className="label label-outing">{KIND_TEXT[r.kind].icon} {KIND_LABEL[r.kind]}</span>}
                {r.labels.map((l) => <LabelChip key={l.id} label={l} href={href(filter, kind, l.id)} />)}
                <div className="req-meta">
                  #{shortId(r.id)} · {r.requester_name} が{timeAgo(r.created_at)}に作成 · {statusLabel(r.kind, r.status)}
                  {r.reviewer_names.length > 0 && <> · レビュアー: {r.reviewer_names.join('、')}</>}
                  {r.parent_id && (
                    <> · <Link href={`/requests/${r.parent_id}`} className="muted"><Octicon name="branch" size={12} /> #{shortId(r.parent_id)} から分岐</Link></>
                  )}
                </div>
              </div>
              <div className="req-side">
                {r.preview_id && <Thumb id={r.preview_id} size={40} />}
                <span className="req-price">{money(r.actual_price ?? r.price, r.currency)}</span>
                {r.comment_count > 0 && (
                  <span title="コメント"><Octicon name="comment" /> {r.comment_count}</span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function Landing() {
  return (
    <div>
      <section className="hero">
        <div className="eyebrow">稟議をマージ</div>
        <h1>RingiWoMerge</h1>
        <p className="tagline">大きな買い物は、家族のレビューを通してから。</p>
        <div className="flow" aria-label="使い方の流れ">
          <b>申請</b>→<b>レビュー</b>→<b>コメント</b>→<b>承認</b>→<b>マージ</b>→<b>購入・お出かけ</b>
        </div>
        <div className="actions" style={{ justifyContent: 'center' }}>
          <Link className="btn btn-primary" href="/register">家族を作成して始める</Link>
          <Link className="btn" href="/login">ログイン</Link>
        </div>
      </section>
      <div className="steps">
        <div className="step-card">
          <div className="n"><Octicon name="pencil" /></div>
          <h3>1. 稟議を作る</h3>
          <p className="muted">買いたいもの・行きたいところを、金額・理由・URLと一緒に家族に伝えます。</p>
        </div>
        <div className="step-card">
          <div className="n"><Octicon name="eye" /></div>
          <h3>2. レビュー</h3>
          <p className="muted">家族が金額・理由・リンク・資料を確認し、コメントで質問できます。</p>
        </div>
        <div className="step-card">
          <div className="n"><Octicon name="merge" /></div>
          <h3>3. 承認してマージ</h3>
          <p className="muted">みんなが納得したらマージ。稟議成立で、買いに行く・出かけるに進みます。</p>
        </div>
      </div>
    </div>
  );
}
