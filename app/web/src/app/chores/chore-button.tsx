'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { toggleChoreCommitAction } from '@/lib/actions';
import type { ChoreStatus } from '@/lib/types';
import { choreScheduleLabel, periodProgressLabel } from '@/lib/format';

/**
 * 家事 1 つぶんのカード。今日の分をコミット / 取り消しする。
 * linked のときは見本画像のサムネイルと、詳細 (きれいな状態の見本) へのリンクを出す。
 */
export default function ChoreButton({ chore, linked = false }: { chore: ChoreStatus; linked?: boolean }) {
  const detail = `/chores/${chore.id}`;
  const first = chore.images[0];
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const toggle = (commit: boolean) =>
    start(async () => {
      setErr(null);
      const r = await toggleChoreCommitAction(chore.id, commit);
      if (r.error) setErr(r.error);
    });

  return (
    <div className={`chore-card${chore.committed_today ? ' done' : ''}`}>
      {linked && first ? (
        <Link href={detail} className="chore-thumb" aria-label={`${chore.name}のきれいな状態の見本を見る`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/chore-images/${first.id}`} alt="" />
          <span className="chore-thumb-icon" aria-hidden="true">{chore.icon}</span>
        </Link>
      ) : (
        <div className="chore-icon" aria-hidden="true">{chore.icon}</div>
      )}
      <div className="chore-name">{linked ? <Link href={detail}>{chore.name}</Link> : chore.name}</div>
      {chore.description && <div className="chore-desc muted small">{chore.description}</div>}
      {choreScheduleLabel(chore) && <div className="chore-schedule small">{choreScheduleLabel(chore)}</div>}
      {linked && chore.images.length > 0 && (
        <Link href={detail} className="small">📷 見本 {chore.images.length}枚</Link>
      )}
      <div className="chore-marks">
        {chore.current_streak > 0 && <span className="label chore-streak">🔥 {chore.current_streak}日連続</span>}
        <span className="muted small">累計 {chore.days}日</span>
        {periodProgressLabel(chore) && (
          <span className={`label ${chore.period_done >= chore.period_target ? 'chore-cleared' : 'label-muted'}`}>{periodProgressLabel(chore)}</span>
        )}
      </div>
      {chore.committed_today ? (
        <div className="chore-done">
          <span className="chore-check">✓ コミット済み</span>
          {/* プッシュした日のコミットは確定済みなので取り消せない */}
          {chore.locked ? (
            <span className="muted small">🏆 プッシュ済み</span>
          ) : (
            <button type="button" className="btn-link small" disabled={pending} onClick={() => toggle(false)}>取り消す</button>
          )}
        </div>
      ) : (
        <button type="button" className="btn-primary" disabled={pending} onClick={() => toggle(true)}>
          コミット
        </button>
      )}
      {err && <div className="error" role="alert" style={{ margin: '8px 0 0' }}>{err}</div>}
    </div>
  );
}
