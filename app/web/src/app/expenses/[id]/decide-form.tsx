'use client';
import { useState, useTransition } from 'react';
import { decideExpenseAction } from '@/lib/actions';

export default function DecideForm({ expenseId }: { expenseId: string }) {
  const [note, setNote] = useState('');
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const decide = (decision: 'approve' | 'reject') => {
    setErr(null);
    const fd = new FormData();
    fd.set('note', note);
    start(async () => {
      try {
        await decideExpenseAction(expenseId, decision, fd);
      } catch (e) {
        setErr((e as Error).message);
      }
    });
  };

  return (
    <div>
      {err && <div className="error">{err}</div>}
      <div className="row">
        <label htmlFor="note">判定メモ (任意)</label>
        <textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className="actions">
        <button onClick={() => decide('approve')} disabled={pending}>承認する</button>
        <button onClick={() => decide('reject')} className="danger" disabled={pending}>
          却下する
        </button>
      </div>
    </div>
  );
}
