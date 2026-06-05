import { getCurrentUser } from '@/lib/session';
import { apiFetch } from '@/lib/api';
import type { Expense } from '@/lib/types';
import { CATEGORY_LABEL, STATUS_LABEL } from '@/lib/types';
import Link from 'next/link';

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <div className="card">
        <h1>経費精算管理システム</h1>
        <p>ログインして利用してください。</p>
        <div className="actions">
          <Link className="btn" href="/login">ログイン</Link>
          <Link className="btn secondary" href="/register">新規登録</Link>
        </div>
        <p className="muted" style={{ marginTop: 20 }}>
          デモアカウント (パスワードはすべて <code>password123</code>):<br />
          管理者: admin@example.com / 承認者: approver@example.com / 社員: employee@example.com
        </p>
      </div>
    );
  }

  const mine = await apiFetch<Expense[]>('/expenses?mine=true');
  const draft = mine.filter((e) => e.status === 'draft').length;
  const submitted = mine.filter((e) => e.status === 'submitted').length;
  const approvedTotal = mine
    .filter((e) => e.status === 'approved')
    .reduce((a, b) => a + b.amount_jpy, 0);

  let pendingApprovals = 0;
  if (user.role === 'approver' || user.role === 'admin') {
    const subs = await apiFetch<Expense[]>('/expenses?status=submitted');
    pendingApprovals = subs.length;
  }

  return (
    <div>
      <h1>ダッシュボード</h1>
      <div className="grid">
        <div className="stat">
          <div className="label">自分の下書き</div>
          <div className="value">{draft}</div>
        </div>
        <div className="stat">
          <div className="label">自分の申請中</div>
          <div className="value">{submitted}</div>
        </div>
        <div className="stat">
          <div className="label">承認済み合計</div>
          <div className="value">¥{approvedTotal.toLocaleString()}</div>
        </div>
        {(user.role === 'approver' || user.role === 'admin') && (
          <div className="stat">
            <div className="label">承認待ち件数</div>
            <div className="value">{pendingApprovals}</div>
          </div>
        )}
      </div>

      <h2>最近の申請</h2>
      <table>
        <thead>
          <tr>
            <th>件名</th>
            <th>カテゴリ</th>
            <th>発生日</th>
            <th className="right">金額</th>
            <th>状態</th>
          </tr>
        </thead>
        <tbody>
          {mine.slice(0, 10).map((e) => (
            <tr key={e.id}>
              <td><Link href={`/expenses/${e.id}`}>{e.title}</Link></td>
              <td>{CATEGORY_LABEL[e.category]}</td>
              <td>{e.incurred_on}</td>
              <td className="right">¥{e.amount_jpy.toLocaleString()}</td>
              <td><span className={`badge badge-${e.status}`}>{STATUS_LABEL[e.status]}</span></td>
            </tr>
          ))}
          {mine.length === 0 && (
            <tr><td colSpan={5} className="muted">まだ申請がありません。</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
