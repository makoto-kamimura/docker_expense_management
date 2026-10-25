import Link from 'next/link';
import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { money, timeAgo } from '@/lib/format';
import { DEFAULT_FILTER, FILTERS, FILTER_STEPS, FILTER_TOP, STATUS_GROUP, statusLabel, typeOf, type FilterKey, type Label, type LinkedRequest, type RequestCounts, type RequestListItem, type RequestType } from '@/lib/types';
import LabelChip from '@/components/LabelChip';
import Octicon, { statusIcon } from '@/components/Octicon';
import StatusBadge from '@/components/StatusBadge';
import { Thumb } from '@/components/LinkCard';

const EMPTY_TEXT: Record<FilterKey, string> = {
  my_turn: 'あなたが対応する稟議はありません 🎉',
  their_turn: '相手の対応を待っている稟議はありません',
  all: 'まだ稟議がありません',
  waiting: 'レビュー待ちの稟議はありません',
  to_review: 'あなたのレビュー待ちはありません 🎉',
  mine: 'あなたの稟議はまだありません',
  approved: '承認済みの稟議はありません',
  purchased: '完了した稟議はありません',
  closed: 'クローズした稟議はありません',
};

export default async function RequestsPage({ searchParams }: { searchParams: { filter?: string; type?: string; label?: string } }) {
  const user = await requireUser();
  if (!user.onboarded) redirect('/onboarding');

  // フィルターの指定がなければレビュー待ちを開く
  const filter: FilterKey = FILTERS.find((f) => f.key === searchParams.filter)?.key ?? DEFAULT_FILTER;
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
  // タブの件数は、種類・ラベルの絞り込みだけを反映する
  const scope = new URLSearchParams(qs);
  scope.delete('filter');
  const [items, counts] = await Promise.all([
    apiFetch<RequestListItem[]>(`/requests?${qs}`),
    apiFetch<RequestCounts>(`/requests/counts?${scope}`),
  ]);
  // フィルター・種類・ラベルを組み合わせたリンク
  const href = (f: FilterKey, k: string | null, l: string | null = label?.id ?? null) => {
    const q = new URLSearchParams();
    if (f !== DEFAULT_FILTER) q.set('filter', f);
    if (k) q.set('type', k);
    if (l) q.set('label', l);
    return q.toString() ? `/requests?${q}` : '/requests';
  };
  // 状態のタブ 1つ (色の点と件数つき)
  const filterTab = (key: FilterKey) => {
    const f = FILTERS.find((x) => x.key === key)!;
    return (
      <Link
        key={f.key}
        href={href(f.key, kind)}
        className={[f.key === filter && 'on', f.tone && `toned tone-${f.tone}`].filter(Boolean).join(' ')}
        aria-current={f.key === filter ? 'page' : undefined}
      >
        {f.label}
        <span className="counter">{counts[f.key]}</span>
      </Link>
    );
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
        <div className="box-head list-filters">
          {/* 状態: 自分の番・相手の番・すべての下に、詳細と同じ3段の流れの枠で段ごとのタブを並べる */}
          <nav className="filters" aria-label="状態で絞り込み">{FILTER_TOP.map(filterTab)}</nav>
          <ol className="ringi-flow filter-steps" aria-label="流れの段で絞り込み">
            {FILTER_STEPS.map((g, i) => (
              <li key={g.title} className={`ringi-flow-step${g.keys.includes(filter) ? ' ringi-flow-selected' : ''}`}>
                <div className="filter-step">
                  <span className="ringi-flow-title">{i + 1}. {g.title}</span>
                  <div className="filters">{g.keys.map(filterTab)}</div>
                </div>
              </li>
            ))}
          </ol>
          <nav className="filters filters-type" aria-label="種類で絞り込み">
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
            {filter !== 'all' && counts.all > 0 && (
              <Link href={href('all', kind)}>すべての稟議を見る ({counts.all}件)</Link>
            )}
          </div>
        ) : (
          items.map((r) => (
            <div key={r.id} className="req-item">
              <div className="req-main">
                <Link href={`/requests/${r.id}`} className="req-title">{r.title}</Link>
                <div className="req-meta">
                  <StatusBadge status={r.status} kind={r.kind} small viewer={r.viewer_role} myTurn={r.my_turn} asked={r.asked_to_reply} />
                  <span>
                    {r.requester_name} の申請
                    {r.reviewer_names.length > 0 && <> · レビュアー: {r.reviewer_names.join('、')}</>}
                    {r.assignee_name && <> · 担当: {r.assignee_name}</>}
                    {' '}· {timeAgo(r.updated_at)}に更新
                  </span>
                </div>
                <LinkedRequests r={r} types={types} />
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

/** 紐づいた稟議 (分岐元・分岐先) の折りたたみ。紐づいた稟議がない行には出さない */
function LinkedRequests({ r, types }: { r: RequestListItem; types: RequestType[] }) {
  const total = (r.parent ? 1 : 0) + r.children_count;
  if (total === 0) return null;
  const rest = r.children_count - r.children.length;
  return (
    <details className="req-links">
      <summary><Octicon name="branch" size={12} /> 紐づいた稟議 {total}件</summary>
      {r.parent && (
        <>
          <div className="req-links-head">分岐元</div>
          <LinkedRow x={r.parent} types={types} />
        </>
      )}
      {r.children.length > 0 && (
        <>
          <div className="req-links-head">分岐先</div>
          {r.children.map((c) => <LinkedRow key={c.id} x={c} types={types} />)}
          {rest > 0 && <div className="muted"><Link href={`/requests/${r.id}`}>ほか {rest}件は詳細画面で</Link></div>}
        </>
      )}
    </details>
  );
}

function LinkedRow({ x, types }: { x: LinkedRequest; types: RequestType[] }) {
  return (
    <div className="req-link">
      <span className={`icon-${STATUS_GROUP[x.status]}`} title={statusLabel(x.kind, x.status)}>
        <Octicon name={statusIcon(x.status)} size={12} />
      </span>
      <Link href={`/requests/${x.id}`}>{typeOf(types, x.type_id, x.kind).icon} {x.title}</Link>
      <span className="muted">{x.requester_name} · {statusLabel(x.kind, x.status)} · {money(x.actual_price ?? x.price, x.currency)}</span>
    </div>
  );
}
