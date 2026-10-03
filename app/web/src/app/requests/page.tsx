import Link from 'next/link';
import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { money, timeAgo } from '@/lib/format';
import { FILTERS, STATUS_GROUP, statusLabel, typeOf, type Label, type RequestListItem, type RequestType } from '@/lib/types';
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

export default async function RequestsPage({ searchParams }: { searchParams: { filter?: string; type?: string; label?: string } }) {
  const user = await requireUser();
  if (!user.onboarded) redirect('/onboarding');

  const filter = FILTERS.some((f) => f.key === searchParams.filter) ? searchParams.filter! : 'all';
  // 種類・ラベルでの絞り込みは、グループに実在する ID のときだけ使う
  const [labels, types] = await Promise.all([apiFetch<Label[]>('/labels'), apiFetch<RequestType[]>('/request-types')]);
  const label = labels.find((l) => l.id === searchParams.label) ?? null;
  const type = types.find((x) => x.id === searchParams.type) ?? null;
  const kind = type?.id ?? null;
  // 絞り込みのタブには表示中の種類と、選んでいる種類を出す
  const typeTabs = types.filter((x) => !x.hidden || x.id === kind);
  const qs = new URLSearchParams({ filter });
  if (kind) qs.set('type', kind);
  if (label) qs.set('label', label.id);
  const items = await apiFetch<RequestListItem[]>(`/requests?${qs}`);
  // フィルター・種類・ラベルを組み合わせたリンク
  const href = (f: string, k: string | null, l: string | null = label?.id ?? null) => {
    const q = new URLSearchParams();
    if (f !== 'all') q.set('filter', f);
    if (k) q.set('type', k);
    if (l) q.set('label', l);
    return q.toString() ? `/requests?${q}` : '/requests';
  };

  return (
    <div>
      <div className="list-head">
        <h1>{filter === 'to_review' ? 'レビュー' : '稟議'}</h1>
        {user.can_request && (
          // 種類はフォームで選ぶ (絞り込み中の種類があれば初期値にする)
          <Link className="btn btn-primary" href={kind ? `/requests/new?type=${kind}` : '/requests/new'}>新しいプロジェクト</Link>
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
            {([null, ...typeTabs] as (RequestType | null)[]).map((x) => (
              <Link key={x?.id ?? 'any'} href={href(filter, x?.id ?? null)} className={(x?.id ?? null) === kind ? 'on' : ''}>
                {x ? `${x.icon} ${x.name}` : 'すべての種類'}
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
                <span className="label label-outing">{typeOf(types, r.type_id, r.kind).icon} {typeOf(types, r.type_id, r.kind).name}</span>
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
