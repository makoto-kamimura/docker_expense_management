import type { RequestKind, RequestStatus, ViewerRole } from '@/lib/types';
import { STATUS_GROUP, statusHint, statusLabel } from '@/lib/types';
import Octicon, { statusIcon } from './Octicon';

/**
 * GitHub の PR 状態ラベル風 (Open = 緑 / Draft = 灰 / Merged = 紫 / Closed = 赤)。hint で説明を添える。
 * viewer を渡すと再確認の依頼を立場に合わせた名前 (確認依頼あり / 確認待ち) にし、myTurn なら「あなたの番」、
 * asked なら「返事のお願い」を添える。
 */
export default function StatusBadge({
  status,
  kind = 'purchase',
  small,
  hint,
  viewer,
  myTurn,
  asked,
}: {
  status: RequestStatus;
  kind?: RequestKind;
  small?: boolean;
  hint?: boolean;
  viewer?: ViewerRole;
  myTurn?: boolean;
  asked?: boolean;
}) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span className={`state state-${STATUS_GROUP[status]}${small ? ' state-sm' : ''}`}>
        <Octicon name={statusIcon(status)} />
        {statusLabel(kind, status, viewer)}
      </span>
      {myTurn && <TurnChip />}
      {asked && <AskChip />}
      {hint && <span className="muted">{statusHint(status, viewer)}</span>}
    </span>
  );
}

/** 自分宛ての返事のお願いがあることの印 */
export function AskChip() {
  return (
    <span className="turn-chip" title="コメントで返事をお願いされています">
      <Octicon name="reply" size={12} />
      返事のお願い
    </span>
  );
}

/** 次に動くのが自分であることの印 */
export function TurnChip() {
  return (
    <span className="turn-chip" title="次はあなたが対応する番です">
      <Octicon name="arrow" size={12} />
      あなたの番
    </span>
  );
}
