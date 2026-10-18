import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { markAllNotificationsReadAction } from '@/lib/actions';
import { timeAgo } from '@/lib/format';
import type { NotificationKind, NotificationList } from '@/lib/types';
import Octicon, { type IconName } from '@/components/Octicon';
import PushToggle from '@/components/PushToggle';

const KIND_ICON: Record<NotificationKind, IconName> = {
  review_requested: 'eye',
  resubmitted: 'eye',
  reopened: 'eye',
  changes_requested: 'redo',
  approved: 'check',
  rejected: 'x',
  merged: 'merge',
};

/** 自分宛ての通知。稟議を開くと、その稟議の通知は既読になる */
export default async function NotificationsPage() {
  await requireUser();
  const [list, key] = await Promise.all([
    apiFetch<NotificationList>('/notifications'),
    apiFetch<{ public_key: string | null }>('/push/public-key'),
  ]);

  return (
    <div style={{ maxWidth: 860 }}>
      <div className="list-head">
        <h1>通知</h1>
        {list.unread > 0 && (
          <form action={markAllNotificationsReadAction}>
            <button type="submit" className="btn-sm">すべて既読にする</button>
          </form>
        )}
      </div>

      <div className="box">
        <div className="box-head">
          <h2>この端末への通知</h2>
          <span className="muted small">レビューの依頼・確認の依頼・承認・却下・マージを知らせます</span>
        </div>
        <div className="box-body">
          <PushToggle publicKey={key.public_key} />
        </div>
      </div>

      <div className="box">
        {list.items.length === 0 ? (
          <div className="empty">
            <Octicon name="bell" size={24} />
            <h3>まだ通知はありません</h3>
          </div>
        ) : (
          list.items.map((n) => (
            <Link key={n.id} href={`/requests/${n.request_id}`} className={`box-row notif-row${n.read_at ? '' : ' notif-unread'}`}>
              <Octicon name={KIND_ICON[n.kind] ?? 'dot'} />
              <span className="notif-main">
                <strong>{n.request_title}</strong>
                <span>{n.message}</span>
              </span>
              <span className="muted small">{timeAgo(n.created_at)}</span>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
