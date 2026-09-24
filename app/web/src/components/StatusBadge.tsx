import type { RequestKind, RequestStatus } from '@/lib/types';
import { STATUS_GROUP, STATUS_HINT, statusLabel } from '@/lib/types';
import Octicon, { statusIcon } from './Octicon';

/** GitHub の PR 状態ラベル風 (Open = 緑 / Draft = 灰 / Merged = 紫 / Closed = 赤)。hint で説明を添える。 */
export default function StatusBadge({
  status,
  kind = 'purchase',
  small,
  hint,
}: {
  status: RequestStatus;
  kind?: RequestKind;
  small?: boolean;
  hint?: boolean;
}) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span className={`state state-${STATUS_GROUP[status]}${small ? ' state-sm' : ''}`}>
        <Octicon name={statusIcon(status)} />
        {statusLabel(kind, status)}
      </span>
      {hint && <span className="muted">{STATUS_HINT[status]}</span>}
    </span>
  );
}
