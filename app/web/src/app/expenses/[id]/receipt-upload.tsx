'use client';
import { useRef, useState, useTransition } from 'react';
import { uploadReceiptAction } from '@/lib/actions';

export default function ReceiptUpload({ expenseId }: { expenseId: string }) {
  const ref = useRef<HTMLFormElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      ref={ref}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setErr(null);
        start(async () => {
          const r = await uploadReceiptAction(expenseId, fd);
          if (r?.error) setErr(r.error);
          else ref.current?.reset();
        });
      }}
      style={{ marginTop: 12 }}
    >
      {err && <div className="error">{err}</div>}
      <div className="row">
        <label htmlFor="file">領収書ファイル (画像/PDF, 最大10MB)</label>
        <input id="file" name="file" type="file" accept="image/*,application/pdf" required />
      </div>
      <button type="submit" className="secondary" disabled={pending}>
        {pending ? 'アップロード中…' : 'アップロード'}
      </button>
    </form>
  );
}
