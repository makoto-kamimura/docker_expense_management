import type { RequestKind, TimelineEntry } from '@/lib/types';
import { describeEvent, fmtDateTime, timeAgo } from '@/lib/format';
import Avatar from './Avatar';
import Octicon, { type IconName } from './Octicon';

const EVENT_ICON: Record<string, IconName> = {
  created: 'pencil',
  submitted: 'pr',
  resubmitted: 'redo',
  started_review: 'eye',
  changes_requested: 'redo',
  approved: 'check',
  rejected: 'x',
  merged: 'merge',
  purchased: 'bag',
  withdrawn: 'pr-closed',
  updated: 'pencil',
  attachment_added: 'paperclip',
  attachment_removed: 'paperclip',
  labeled: 'tag',
};

/** Activity: コメントと操作履歴を時系列で表示する (GitHub PR の Conversation 風) */
export default function Timeline({
  entries,
  requesterId,
  meId,
  kind = 'purchase',
}: {
  entries: TimelineEntry[];
  requesterId: string;
  meId?: string;
  kind?: RequestKind;
}) {
  return (
    <div className="timeline">
      {entries.map((e) =>
        e.type === 'comment' ? (
          <div key={e.id} className={`tl-comment${e.user?.id === meId ? ' mine' : ''}`}>
            <Avatar name={e.user?.name ?? '?'} large />
            <div className="box">
              <div className="box-head">
                <span>
                  <strong>{e.user?.name ?? '退会したメンバー'}</strong>{' '}
                  <span className="muted" title={fmtDateTime(e.created_at)}>{timeAgo(e.created_at)}にコメント</span>
                </span>
                {e.user?.id === requesterId && <span className="label label-muted">申請者</span>}
              </div>
              <div className="box-body pre">{e.body}</div>
            </div>
          </div>
        ) : (
          <div key={e.id} className="tl-event">
            <span className={`tl-badge ${e.action}`}><Octicon name={EVENT_ICON[e.action] ?? 'dot'} /></span>
            <span>
              {describeEvent(e, kind)}{' '}
              <span className="small" title={fmtDateTime(e.created_at)}>{timeAgo(e.created_at)}</span>
            </span>
          </div>
        ),
      )}
    </div>
  );
}
