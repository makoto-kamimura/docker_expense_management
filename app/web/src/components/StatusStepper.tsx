import type { ExpenseStatus } from '@/lib/types';
import { STATUS_LABEL } from '@/lib/types';

// 通常フロー: 下書き → 申請中 → 承認済
// 却下された場合は最終ステップを「承認済」から「却下」に差し替えて分岐を表現する
const FLOW: ExpenseStatus[] = ['draft', 'submitted', 'approved'];

export default function StatusStepper({ status }: { status: ExpenseStatus }) {
  const steps: ExpenseStatus[] =
    status === 'rejected' ? ['draft', 'submitted', 'rejected'] : FLOW;
  const currentIndex = steps.indexOf(status);

  return (
    <ol className="stepper" aria-label="申請ステータス">
      {steps.map((s, i) => {
        const state =
          i < currentIndex ? 'done' : i === currentIndex ? 'current' : 'todo';
        return (
          <li
            key={s}
            className={`step step-${state} step-${s}`}
            aria-current={state === 'current' ? 'step' : undefined}
          >
            <span className="step-marker">{state === 'done' ? '✓' : i + 1}</span>
            <span className="step-label">{STATUS_LABEL[s]}</span>
          </li>
        );
      })}
    </ol>
  );
}
