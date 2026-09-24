import Link from 'next/link';
import { money, timeAgo } from '@/lib/format';
import type { RequestDetail } from '@/lib/types';
import StatusBadge from './StatusBadge';
import Octicon from './Octicon';

/** 稟議の見出し (タイトル・状態・申請者とレビュアー・分岐元・金額)。詳細と履歴で共通 */
export default function RequestHeader({ d, canRequest }: { d: RequestDetail; canRequest: boolean }) {
  const { request: r, permissions: p } = d;
  const reviewerNames = d.reviewers.map((x) => x.name).join('、');
  return (
      <div className="detail-head">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <h1>
            {r.title} <span className="num">#{r.id.slice(0, 7)}</span>
          </h1>
          <div className="actions">
            {p.can_edit && <Link className="btn btn-sm" href={`/requests/${r.id}/edit`}>編集</Link>}
            {canRequest && (
              <Link className="btn btn-sm" href={`/requests/new?parent=${r.id}`}>
                <Octicon name="branch" /> 分岐
              </Link>
            )}
            <Link className="btn btn-sm" href={`/requests/${r.id}/summary`}>まとめ資料</Link>
          </div>
        </div>
        <div className="detail-sub">
          <StatusBadge status={r.status} kind={r.kind} />
          <span>
            <strong>{d.requester.name}</strong> が
            {reviewerNames ? <> <strong>{reviewerNames}</strong> にレビューを依頼</> : ' 作成'}
            {r.submitted_at ? `（${timeAgo(r.submitted_at)}）` : `（${timeAgo(r.created_at)}）`}
          </span>
          {d.parent && (
            <span className="muted">
              <Octicon name="branch" /> <Link href={`/requests/${d.parent.id}`}>「{d.parent.title}」#{d.parent.id.slice(0, 7)}</Link> から分岐
            </span>
          )}
          <span className="price" style={{ marginLeft: 'auto', color: 'var(--fg)' }}>{money(r.price, r.currency)}</span>
        </div>
      </div>

  );
}
