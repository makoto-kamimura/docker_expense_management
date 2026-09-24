'use client';
import { useState, useTransition } from 'react';

type ActionFn = (fd: FormData) => Promise<{ error?: string }>;

export default function LoginForm({ action }: { action: ActionFn }) {
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
        <label htmlFor="email">メールアドレス</label>
        <input id="email" name="email" type="email" required autoComplete="email" />
      </div>
      <div className="row">
        <label htmlFor="password">パスワード</label>
        <input id="password" name="password" type="password" required autoComplete="current-password" />
      </div>
      <button type="submit" className="btn-primary" disabled={pending} style={{ width: '100%' }}>
        {pending ? 'ログイン中…' : 'ログイン'}
      </button>
    </form>
  );
}
