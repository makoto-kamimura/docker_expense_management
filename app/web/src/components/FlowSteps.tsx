import Link from 'next/link';
import { currentPhase, flowSteps, type FlowPhase, type FlowState } from '@/lib/format';
import type { RequestDetail } from '@/lib/types';
import Avatar from './Avatar';
import Octicon, { type IconName } from './Octicon';
import { TurnChip } from './StatusBadge';

const STATE_ICON: Record<FlowState, IconName> = { done: 'check', current: 'dot', todo: 'dot', stopped: 'x' };
const STATE_LABEL: Record<FlowState, string> = { done: '済み', current: '今ここ', todo: 'これから', stopped: '止まった' };

/**
 * 稟議の流れ「申請 → 承認 → 実行」。誰が動く段か・どこまで進んだかを詳細画面の上に出す。
 * 段を押すと、その段の中身 (selected) に切り替える。今の段へのリンクはクエリなしにして、操作のあとも今の段についていく
 */
export default function FlowSteps({ d, meId, selected }: { d: RequestDetail; meId: string; selected: FlowPhase }) {
  const live = currentPhase(d.request);
  return (
    <ol className="ringi-flow" aria-label="稟議の流れ">
      {flowSteps(d).map((st, i) => {
        const current = st.state === 'current';
        const mine = current && d.my_turn && st.people.some((p) => p.id === meId);
        const on = st.phase === selected;
        const href = st.phase === live ? `/requests/${d.request.id}` : `/requests/${d.request.id}?step=${st.phase}`;
        return (
          <li key={st.phase} className={`ringi-flow-step ringi-flow-${st.state}${on ? ' ringi-flow-selected' : ''}`} aria-current={current ? 'step' : undefined}>
            <Link href={href} className="ringi-flow-link" aria-current={on ? 'page' : undefined}>
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
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
