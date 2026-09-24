'use client';
import { useState, useTransition } from 'react';
import { pushChoresAction } from '@/lib/actions';
import type { PushStatus } from '@/lib/types';
import ConfirmButton from '@/components/ConfirmButton';

/** 種類 (すべて / 毎日 / 週 / 月) の家事をすべてクリアしたときだけ出すプッシュボタン。押すとその種類のトロフィーを取る (取り消せない) */
export default function PushButton({ status }: { status: PushStatus }) {
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const what = status.scope === 'all' ? '今日の家事' : `${status.label}の家事`;
  return (
    <div className="push-panel">
      <div>
        <strong>{what}を{status.total}件すべてクリアしました！</strong>
        <div className="muted small">プッシュすると、{status.period}の「{status.trophy_label}」トロフィー {status.trophy_icon} が実績として残ります。</div>
      </div>
      <ConfirmButton
        label="🚀 プッシュする"
        className="btn-merge"
        title={`${what}をプッシュしますか？`}
        confirmLabel="プッシュする"
        confirmClassName="btn-merge"
        disabled={pending}
        onConfirm={() =>
          start(async () => {
            setErr(null);
            const r = await pushChoresAction(status.scope);
            if (r.error) setErr(r.error);
          })
        }
      >
        <p>「{status.trophy_label}」トロフィー {status.trophy_icon} を獲得し、消えない実績として残ります。</p>
        <p className="muted">プッシュした後は、対象の家事の今日のコミットを取り消せなくなります。</p>
      </ConfirmButton>
      {err && <div className="error" role="alert" style={{ width: '100%', margin: 0 }}>{err}</div>}
    </div>
  );
}
