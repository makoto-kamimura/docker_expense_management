import { flowSteps, type FlowState } from '@/lib/format';
import type { RequestDetail } from '@/lib/types';
import Avatar from './Avatar';
import Octicon, { type IconName } from './Octicon';
import { TurnChip } from './StatusBadge';

const STATE_ICON: Record<FlowState, IconName> = { done: 'check', current: 'dot', todo: 'dot', stopped: 'x' };
const STATE_LABEL: Record<FlowState, string> = { done: '済み', current: '今ここ', todo: 'これから', stopped: '止まった' };

/** 稟議の流れ「申請 → 承認 → 実行」。誰が動く段か・どこまで進んだかを詳細画面の上に出す */
export default function FlowSteps({ d, meId }: { d: RequestDetail; meId: string }) {
  return (
    <ol className="ringi-flow" aria-label="稟議の流れ">
      {flowSteps(d).map((st, i) => {
        const current = st.state === 'current';
        const mine = current && d.my_turn && st.people.some((p) => p.id === meId);
        return (
          <li key={st.title} className={`ringi-flow-step ringi-flow-${st.state}`} aria-current={current ? 'step' : undefined}>
            <span className="ringi-flow-mark" title={STATE_LABEL[st.state]}><Octicon name={STATE_ICON[st.state]} size={12} /></span>
            <span className="ringi-flow-body">
              <span className="ringi-flow-title">
                {i + 1}. {st.title}
                <span className="ringi-flow-note">{st.note}</span>
                {mine && <TurnChip />}
              </span>
              <span className="ringi-flow-people">
                {st.people.length === 0 && <span className="muted">未指定</span>}
                {st.people.map((p) => (
                  <span key={p.id} className="ringi-flow-person"><Avatar name={p.name} />{p.name}</span>
                ))}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
