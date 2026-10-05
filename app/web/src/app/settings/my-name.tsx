'use client';
import { useState, useTransition } from 'react';
import { updateMyNameAction } from '@/lib/actions';

/** 自分の表示名を変える */
export default function MyName({ name }: { name: string }) {
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  return (
    <form
      className="actions"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setErr(null);
        setSaved(false);
        start(async () => {
          const r = await updateMyNameAction(fd);
          if (r?.error) setErr(r.error);
          else setSaved(true);
        });
      }}
    >
      <input name="name" defaultValue={name} required maxLength={50} aria-label="表示名" style={{ flex: 1, minWidth: 200 }} />
      <button type="submit" disabled={pending}>{pending ? '保存中…' : '保存'}</button>
      {saved && <span className="muted small">保存しました</span>}
      {err && <span className="error" style={{ margin: 0 }}>{err}</span>}
    </form>
  );
}
