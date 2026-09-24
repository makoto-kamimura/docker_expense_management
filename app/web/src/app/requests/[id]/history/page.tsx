import Link from 'next/link';
import { getRequestOr404 } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { describeEvent, fieldLabel, fmtDateTime, formatChangeValue, timeAgo, type FieldChange } from '@/lib/format';
import type { TimelineEntry } from '@/lib/types';
import Avatar from '@/components/Avatar';
import Octicon, { type IconName } from '@/components/Octicon';
import RequestHeader from '@/components/RequestHeader';
import RequestTabs from '@/components/RequestTabs';

type EventEntry = Extract<TimelineEntry, { type: 'event' }>;

const EVENT_ICON: Record<string, IconName> = {
  created: 'pencil',
  updated: 'pencil',
  submitted: 'pr',
  resubmitted: 'redo',
  started_review: 'eye',
  changes_requested: 'redo',
  approved: 'check',
  rejected: 'x',
  merged: 'merge',
  purchased: 'bag',
  withdrawn: 'pr-closed',
  reopened: 'pr',
  branched: 'branch',
  attachment_added: 'paperclip',
  attachment_removed: 'paperclip',
};

/** 日本時間の日付 (グループ見出し用) */
const day = (iso: string) =>
  new Date(iso).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });

/** 稟議の変更履歴 (GitHub の Commits 風)。操作ごとに、編集は変更前 → 変更後を表示する */
export default async function HistoryPage({ params }: { params: { id: string } }) {
  const user = await requireUser();
  const d = await getRequestOr404(params.id);
  const r = d.request;
  const events = d.timeline.filter((e): e is EventEntry => e.type === 'event').reverse();
  const groups: { day: string; items: EventEntry[] }[] = [];
  for (const e of events) {
    const k = day(e.created_at);
    const last = groups[groups.length - 1];
    if (last && last.day === k) last.items.push(e);
    else groups.push({ day: k, items: [e] });
  }

  return (
    <div>
      <RequestHeader d={d} canRequest={user.can_request} />
      <RequestTabs id={r.id} active="history" d={d} />

      {groups.length === 0 && <p className="muted">履歴はまだありません。</p>}
      {groups.map((g) => (
        <section key={g.day} className="history-group">
          <h3 className="history-day"><Octicon name="history" /> {g.day}</h3>
          <div className="box">
            {g.items.map((e) => {
              const changes = (e.metadata.changes as FieldChange[] | undefined) ?? [];
              return (
                <div key={e.id} className="history-item">
                  <div className="history-row">
                    <span className={`tl-badge ${e.action}`}><Octicon name={EVENT_ICON[e.action] ?? 'dot'} /></span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="history-title">{describeEvent(e, r.kind)}</div>
                      <div className="muted small">
                        <Avatar name={e.user?.name ?? '?'} /> {e.user?.name ?? '退会したメンバー'} ·{' '}
                        <span title={fmtDateTime(e.created_at)}>{timeAgo(e.created_at)}</span>
                        {e.action === 'branched' && typeof e.metadata.child_id === 'string' && (
                          <> · <Link href={`/requests/${e.metadata.child_id}`}>分岐した稟議を見る</Link></>
                        )}
                        {e.action === 'created' && typeof e.metadata.parent_id === 'string' && (
                          <> · <Link href={`/requests/${e.metadata.parent_id}`}>分岐元を見る</Link></>
                        )}
                      </div>
                    </div>
                    <code className="history-id">{e.id.slice(0, 7)}</code>
                  </div>
                  {changes.length > 0 && (
                    <div className="table-wrap">
                      <table className="diff">
                        <thead>
                          <tr><th style={{ width: 140 }}>項目</th><th>変更前</th><th>変更後</th></tr>
                        </thead>
                        <tbody>
                          {changes.map((c) => (
                            <tr key={c.field}>
                              <th scope="row">{fieldLabel(c.field, r.kind)}</th>
                              <td className="diff-del pre"><span aria-label="変更前">− </span>{formatChangeValue(c.field, c.before, r.currency)}</td>
                              <td className="diff-add pre"><span aria-label="変更後">+ </span>{formatChangeValue(c.field, c.after, r.currency)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {e.action === 'updated' && changes.length === 0 && (
                    <p className="muted small" style={{ margin: '4px 0 0 34px' }}>この変更は詳細な差分が記録される前のものです。</p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
