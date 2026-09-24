import type { RequestStatus } from '@/lib/types';
import { STATUS_GROUP } from '@/lib/types';

/** GitHub の Octicons 風の 16px アイコン (線画で自作) */
export type IconName =
  | 'pr' | 'pr-draft' | 'merge' | 'pr-closed' | 'bag' | 'check' | 'x' | 'comment'
  | 'eye' | 'pencil' | 'arrow' | 'paperclip' | 'dot' | 'redo' | 'branch' | 'history' | 'tag';

export default function Octicon({ name, size = 16, className }: { name: IconName; size?: number; className?: string }) {
  const p = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const body = (() => {
    switch (name) {
      case 'pr':
        return (<><circle cx="4" cy="3.5" r="1.75" {...p} /><circle cx="4" cy="12.5" r="1.75" {...p} /><circle cx="12" cy="12.5" r="1.75" {...p} /><path d="M4 5.25v5.5M12 10.75V6.5a2 2 0 0 0-2-2H7.5M9 3 7.5 4.5 9 6" {...p} /></>);
      case 'pr-draft':
        return (<><circle cx="4" cy="3.5" r="1.75" {...p} /><circle cx="4" cy="12.5" r="1.75" {...p} /><circle cx="12" cy="12.5" r="1.75" {...p} /><path d="M4 5.25v5.5M12 3v1.5M12 7v1.5" {...p} /></>);
      case 'merge':
        return (<><circle cx="4" cy="3.5" r="1.75" {...p} /><circle cx="4" cy="12.5" r="1.75" {...p} /><circle cx="12" cy="8" r="1.75" {...p} /><path d="M4 5.25v5.5M4.8 5c.9 2 3 3 5.45 3" {...p} /></>);
      case 'pr-closed':
        return (<><circle cx="4" cy="3.5" r="1.75" {...p} /><circle cx="4" cy="12.5" r="1.75" {...p} /><circle cx="12" cy="12.5" r="1.75" {...p} /><path d="M4 5.25v5.5M12 10.75V8M10.25 2.25l3.5 3.5M13.75 2.25l-3.5 3.5" {...p} /></>);
      case 'bag':
        return (<><path d="M3 5.5h10l-.8 8H3.8z" {...p} /><path d="M5.75 5.5V4.25a2.25 2.25 0 0 1 4.5 0V5.5" {...p} /></>);
      case 'check':
        return <path d="M3 8.5 6.5 12 13 4.5" {...p} strokeWidth={2} />;
      case 'x':
        return <path d="M4 4l8 8M12 4l-8 8" {...p} strokeWidth={2} />;
      case 'comment':
        return <path d="M2.5 3.5h11v7.5h-6l-3 2.5v-2.5h-2z" {...p} />;
      case 'eye':
        return (<><path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" {...p} /><circle cx="8" cy="8" r="2" {...p} /></>);
      case 'pencil':
        return <path d="M11 2.5l2.5 2.5-7.5 7.5H3.5V10z" {...p} />;
      case 'arrow':
        return <path d="M3 8h9M9 5l3 3-3 3" {...p} />;
      case 'paperclip':
        return <path d="M10.5 5.5 6 10a1.4 1.4 0 0 0 2 2l5-5a2.8 2.8 0 0 0-4-4L4 8a4.2 4.2 0 0 0 6 6l3.5-3.5" {...p} />;
      case 'tag':
        return (<><path d="M1.75 2.75v4.1c0 .4.16.78.44 1.06l5.9 5.9a1.5 1.5 0 0 0 2.12 0l3.35-3.35a1.5 1.5 0 0 0 0-2.12l-5.9-5.9a1.5 1.5 0 0 0-1.06-.44h-4.1a.75.75 0 0 0-.75.75Z" {...p} /><circle cx="5" cy="5" r="1" {...p} /></>);
      case 'history':
        return (<><path d="M2.5 8a5.5 5.5 0 1 0 1.6-3.9M2.5 2.5v2.5H5" {...p} /><path d="M8 5v3l2 1.5" {...p} /></>);
      case 'branch':
        return (<><circle cx="4" cy="3.5" r="1.75" {...p} /><circle cx="4" cy="12.5" r="1.75" {...p} /><circle cx="12" cy="4.5" r="1.75" {...p} /><path d="M4 5.25v5.5M12 6.25c0 3-2.5 4-7.2 5.2" {...p} /></>);
      case 'redo':
        return <path d="M12.5 5.5H6a3.5 3.5 0 0 0 0 7h4M10 3l2.5 2.5L10 8" {...p} />;
      case 'dot':
      default:
        return <circle cx="8" cy="8" r="3" fill="currentColor" />;
    }
  })();
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" className={className} style={{ flex: 'none', verticalAlign: 'text-bottom' }}>
      {body}
    </svg>
  );
}

/** 申請の状態に対応する PR 風アイコン */
export function statusIcon(status: RequestStatus): IconName {
  switch (STATUS_GROUP[status]) {
    case 'draft': return 'pr-draft';
    case 'merged': return 'merge';
    case 'done': return 'bag';
    case 'closed': return 'pr-closed';
    default: return 'pr';
  }
}
