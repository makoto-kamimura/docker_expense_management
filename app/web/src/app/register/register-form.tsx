'use client';
import { useState, useTransition } from 'react';

type ActionFn = (fd: FormData) => Promise<{ error?: string }>;

export default function RegisterForm({ action }: { action: ActionFn }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setError(null);
        start(async () => {
          const r = await action(fd);
          if (r?.error) setError(r.error);
        });
      }}
    >
      {error && <div className="error">{error}</div>}
      <div className="row">
        <label htmlFor="name">氏名</label>
        <input id="name" name="name" required />
      </div>
      <div className="row">
        <label htmlFor="email">メールアドレス</label>
        <input id="email" name="email" type="email" required autoComplete="email" />
      </div>
      <div className="row">
        <label htmlFor="password">パスワード (8文字以上)</label>
        <input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" />
      </div>
      <button type="submit" disabled={pending}>
        {pending ? '送信中…' : '登録'}
      </button>
    </form>
  );
}
