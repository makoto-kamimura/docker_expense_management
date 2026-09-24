'use client';
import { useState, useTransition } from 'react';

type ActionFn = (fd: FormData) => Promise<{ error?: string }>;
type Account = { role: string; email: string };

// 手入力や自動入力のミスを避けるため、行ごとのボタンでそのままログインさせる
export default function DemoAccounts({
  action,
  accounts,
  password,
}: {
  action: ActionFn;
  accounts: Account[];
  password: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const login = (email: string) => {
    const fd = new FormData();
    fd.set('email', email);
    fd.set('password', password);
    setError(null);
    start(async () => {
      const r = await action(fd);
      if (r?.error) setError(r.error);
    });
  };

  return (
    <>
      {error && <div className="error">{error}</div>}
      <table>
        <thead>
          <tr>
            <th>アカウント</th>
            <th>メールアドレス</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {accounts.map((a) => (
            <tr key={a.email}>
              <td>{a.role}</td>
              <td>{a.email}</td>
              <td className="right">
                <button type="button" className="btn-sm" disabled={pending} onClick={() => login(a.email)}>
                  ログイン
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
