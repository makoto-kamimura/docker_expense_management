import { Fragment } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { money, timeAgo } from '@/lib/format';
import { DEFAULT_TURN, FILTER_STEPS, STATUS_FILTERS, STATUS_GROUP, TURN_FILTERS, parseListFilter, statusLabel, typeOf, type Label, type LinkedRequest, type RequestCounts, type RequestListItem, type RequestType, type StatusFilterKey, type TurnKey } from '@/lib/types';
import LabelChip from '@/components/LabelChip';
import Octicon, { statusIcon } from '@/components/Octicon';
import StatusBadge from '@/components/StatusBadge';
import { Thumb } from '@/components/LinkCard';

/** 段を選んでいるときの、空の一覧の文言 (番で絞り込んでいないとき) */
const EMPTY_TEXT: Record<StatusFilterKey, string> = {
  waiting: 'レビュー待ちの稟議はありません',
  to_review: 'あなたのレビュー待ちはありません 🥳',
  mine: 'あなたの稟議はまだありません',
  approved: '承認済みの稟議はありません',
  purchased: '完了した稟議はありません',
  closed: 'クローズした稟議はありません',
};
/** 段を選んでいないときの、空の一覧の文言 */
const EMPTY_TURN_TEXT: Record<TurnKey, string> = {
  my_turn: 'あなたが対応する稟議はありません 🥳',
  their_turn: '相手の対応を待っている稟議はありません',
  all: 'まだ稟議がありません',
};

function emptyText(status: StatusFilterKey | null, turn: TurnKey): string {
  if (!status) return EMPTY_TURN_TEXT[turn];
  if (turn === 'all') return EMPTY_TEXT[status];
  const s = STATUS_FILTERS.find((f) => f.key === status)!.label;
  return `${s}のうち、${turn === 'my_turn' ? 'あなたの番' : '相手の番'}の稟議はありません`;
}

export default async function RequestsPage({ searchParams }: { searchParams: { filter?: string; turn?: string; type?: string; label?: string } }) {
  const user = await requireUser();
  if (!user.onboarded) redirect('/onboarding');

  // 段 (filter) と番 (turn)。指定がなければ全段の自分の番を開く
  const { status, turn } = parseListFilter(searchParams.filter, searchParams.turn);
  // 種類・ラベルでの絞り込みは、グループに実在する ID のときだけ使う
  const [labels, types] = await Promise.all([apiFetch<Label[]>('/labels'), apiFetch<RequestType[]>('/request-types')]);
  const label = labels.find((l) => l.id === searchParams.label) ?? null;
  const type = types.find((x) => x.id === searchParams.type) ?? null;
  const kind = type?.id ?? null;
  // 絞り込みのタブには表示中の種類と、選んでいる種類を出す
  const typeTabs = types.filter((x) => !x.hidden || x.id === kind);
  const qs = new URLSearchParams({ turn });
  if (status) qs.set('filter', status);
  if (kind) qs.set('type', kind);
  if (label) qs.set('label', label.id);
  // 件数は、段のタブには番を、番のタブには段を反映する (種類・ラベルはどちらにも)
  const [items, counts] = await Promise.all([
    apiFetch<RequestListItem[]>(`/requests?${qs}`),
    apiFetch<RequestCounts>(`/requests/counts?${qs}`),
  ]);
  // 段・番・種類・ラベルを組み合わせたリンク (指定しないものは今のまま。全段の自分の番は /requests)
  const href = (to: { status?: StatusFilterKey | null; turn?: TurnKey; type?: string | null; label?: string | null }) => {
    const s = to.status === undefined ? status : to.status;
    const t = to.turn ?? turn;
    const k = to.type === undefined ? kind : to.type;
    const l = to.label === undefined ? label?.id ?? null : to.label;
    const q = new URLSearchParams();
    if (s) q.set('filter', s);
    if (s || t !== DEFAULT_TURN) q.set('turn', t);
    if (k) q.set('type', k);
    if (l) q.set('label', l);
    return q.toString() ? `/requests?${q}` : '/requests';
  };
  // 段のタブ 1つ (色の点と件数つき)。選んでいるタブをもう一度押すと、段の絞り込みを外す
  const statusTab = (key: StatusFilterKey) => {
    const f = STATUS_FILTERS.find((x) => x.key === key)!;
    const on = key === status;
    return (
      <Link
        key={key}
        href={href({ status: on ? null : key })}
        className={`toned tone-${f.tone}${on ? ' on' : ''}`}
        aria-current={on ? 'page' : undefined}
        title={on ? 'もう一度押すと、段の絞り込みを外します' : undefined}
      >
        {f.label}
        <span className="counter">{counts.status[key]}</span>
        {on && <Octicon name="x" size={12} />}
      </Link>
    );
  };
  // 番の絞り込みのタブ 1つ
  const turnTab = (key: TurnKey) => {
    const f = TURN_FILTERS.find((x) => x.key === key)!;
    const on = key === turn;
    return (
      <Link
        key={key}
        href={href({ turn: key })}
        className={[on && 'on', f.tone && `toned tone-${f.tone}`].filter(Boolean).join(' ')}
        aria-current={on ? 'page' : undefined}
      >
        {f.label}
        <span className="counter">{counts.turn[key]}</span>
      </Link>
    );
  };
  // 自分の番とそれ以外が混ざるときは、自分の番を先にして見出しで分ける (それぞれの中の並びは API のまま)
  const myTurn = items.filter((r) => r.my_turn);
  const others = items.filter((r) => !r.my_turn);
  const groups =
    myTurn.length > 0 && others.length > 0
      ? [{ title: 'あなたの番', items: myTurn }, { title: 'そのほか', items: others }]
      : [{ title: null, items }];

  return (
    <div>
      <div className="list-head">
        <h1>{status === 'to_review' ? 'レビュー' : '稟議'}</h1>
        {user.can_request && (
          // 種類はフォームで選ぶ (絞り込み中の種類があれば初期値にする)
          <Link className="btn btn-primary" href={kind ? `/requests/new?type=${kind}` : '/requests/new'}>新しいプロジェクト</Link>
        )}
      </div>

      <div className="box">
        <div className="box-head list-filters">
          {/* 段: 詳細と同じ3段の流れの枠に、段ごとのタブを並べる */}
          <ol className="ringi-flow filter-steps" aria-label="流れの段で絞り込み">
            {FILTER_STEPS.map((g, i) => (
              <li key={g.title} className={`ringi-flow-step${status && g.keys.includes(status) ? ' ringi-flow-selected' : ''}`}>
                <div className="filter-step">
                  <span className="ringi-flow-title">{i + 1}. {g.title}</span>
                  <div className="filters">{g.keys.map(statusTab)}</div>
                </div>
              </li>
            ))}
          </ol>
          {/* 絞り込み: 番と種類。段のタブと掛け合わせる */}
          <div className="filter-box" role="group" aria-label="絞り込み">
            <div className="filter-box-title">絞り込み</div>
            <div className="filter-row">
              <span className="filter-row-label">番</span>
              <nav className="filters" aria-label="番で絞り込み">{TURN_FILTERS.map((f) => turnTab(f.key))}</nav>
            </div>
            <div className="filter-row">
              <span className="filter-row-label">種類</span>
              <nav className="filters" aria-label="種類で絞り込み">
                {([null, ...typeTabs] as (RequestType | null)[]).map((x) => (
                  <Link key={x?.id ?? 'any'} href={href({ type: x?.id ?? null })} className={(x?.id ?? null) === kind ? 'on' : ''}>
                    {x ? `${x.icon} ${x.name}` : 'すべての種類'}
                  </Link>
                ))}
              </nav>
              <span className="muted small filter-count">{items.length} 件</span>
            </div>
          </div>
        </div>
        {label && (
          <div className="box-row label-filter">
            <span className="muted small">ラベル:</span>
            <LabelChip label={label} />
            <Link href={href({ label: null })} className="small">× 絞り込みを解除</Link>
          </div>
        )}
        {items.length === 0 ? (
          <div className="empty">
            <Octicon name="pr" size={24} />
            <h3>{emptyText(status, turn)}</h3>
            {!status && turn === 'all' && user.can_request && (
              <Link className="btn btn-primary" href="/requests/new">最初の稟議を作成</Link>
            )}
            {(status || turn !== 'all') && (
              <Link href={href({ status: null, turn: 'all' })}>すべての稟議を見る</Link>
            )}
          </div>
        ) : (
          groups.map((g) => (
            <Fragment key={g.title ?? 'all'}>
              {g.title && (
                <div className="req-group-head">
                  {g.title} <span className="counter">{g.items.length}</span>
                </div>
              )}
              {g.items.map((r) => <RequestRow key={r.id} r={r} types={types} />)}
            </Fragment>
          ))
        )}
      </div>
    </div>
  );
}

/** 一覧の 1 行。自分の番の行は、左の帯と背景で目立たせる */
function RequestRow({ r, types }: { r: RequestListItem; types: RequestType[] }) {
  return (
    <div className={`req-item${r.my_turn ? ' req-my-turn' : ''}`}>
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
