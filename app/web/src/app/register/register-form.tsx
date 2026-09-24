'use client';
import { useState, useTransition } from 'react';

type ActionFn = (fd: FormData) => Promise<{ error?: string }>;

export default function RegisterForm({ action }: { action: ActionFn }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [mode, setMode] = useState<'create' | 'join'>('create');

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
        <label>家族</label>
        <div className="chips">
          <label className={`chip${mode === 'create' ? ' chip-on' : ''}`}>
            <input type="radio" name="mode" value="create" checked={mode === 'create'} onChange={() => setMode('create')} />
            家族を新しく作る
          </label>
          <label className={`chip${mode === 'join' ? ' chip-on' : ''}`}>
            <input type="radio" name="mode" value="join" checked={mode === 'join'} onChange={() => setMode('join')} />
            招待コードで参加
          </label>
        </div>
      </div>
      {mode === 'create' ? (
        <div className="row">
          <label htmlFor="family_name">家族の名前<span className="hint">あなたが管理者になります</span></label>
          <input id="family_name" name="family_name" required placeholder="例: 山田家" />
        </div>
      ) : (
        <div className="row">
          <label htmlFor="invite_code">招待コード<span className="hint">家族の管理者から受け取ったコード</span></label>
          <input id="invite_code" name="invite_code" required autoCapitalize="characters" />
        </div>
      )}
      <div className="row">
        <label htmlFor="name">表示名<span className="hint">家族に表示される名前 (例: パパ)</span></label>
        <input id="name" name="name" required />
      </div>
      <div className="row">
        <label htmlFor="email">メールアドレス</label>
        <input id="email" name="email" type="email" required autoComplete="email" />
      </div>
      <div className="row">
        <label htmlFor="password">パスワード<span className="hint">8文字以上</span></label>
        <input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" />
      </div>
      <button type="submit" className="btn-primary" disabled={pending} style={{ width: '100%' }}>
        {pending ? '作成中…' : 'アカウントを作成'}
      </button>
    </form>
  );
}
