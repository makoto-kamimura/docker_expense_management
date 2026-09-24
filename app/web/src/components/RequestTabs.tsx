import Link from 'next/link';
import type { RequestDetail } from '@/lib/types';
import Octicon from './Octicon';

/** 詳細の「会話 / 履歴」タブ (GitHub PR の Conversation / Commits 風) */
export default function RequestTabs({ id, active, d }: { id: string; active: 'conversation' | 'history'; d: RequestDetail }) {
  const comments = d.timeline.filter((e) => e.type === 'comment').length;
  const history = d.timeline.filter((e) => e.type === 'event').length;
  return (
    <nav className="underline-nav request-tabs" aria-label="稟議のタブ">
      <Link href={`/requests/${id}`} className={active === 'conversation' ? 'selected' : ''} aria-current={active === 'conversation' ? 'page' : undefined}>
        <Octicon name="comment" /> 会話 <span className="counter">{comments}</span>
      </Link>
      <Link href={`/requests/${id}/history`} className={active === 'history' ? 'selected' : ''} aria-current={active === 'history' ? 'page' : undefined}>
        <Octicon name="history" /> 履歴 <span className="counter">{history}</span>
      </Link>
    </nav>
  );
}
