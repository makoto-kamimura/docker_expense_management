import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { requireUser } from '@/lib/session';
import type { Expense, User } from '@/lib/types';
import { CATEGORY_LABEL, STATUS_LABEL } from '@/lib/types';

export default async function ApprovalsPage() {
  const user = await requireUser();
  if (user.role !== 'admin' && user.role !== 'approver') {
    return <div className="card"><p>権限がありません。</p></div>;
  }
  const [submitted, users] = await Promise.all([
    apiFetch<Expense[]>('/expenses?status=submitted'),
    apiFetch<User[]>('/users'),
  ]);
  const userMap = new Map(users.map((u) => [u.id, u]));

  return (
    <div>
      <h1>承認待ち申請</h1>
      <table>
        <thead>
          <tr>
            <th>申請者</th>
            <th>件名</th>
            <th>カテゴリ</th>
            <th>発生日</th>
            <th className="right">金額</th>
            <th>状態</th>
          </tr>
        </thead>
        <tbody>
          {submitted.map((e) => (
            <tr key={e.id}>
              <td>{userMap.get(e.user_id)?.name ?? e.user_id}</td>
              <td><Link href={`/expenses/${e.id}`}>{e.title}</Link></td>
              <td>{CATEGORY_LABEL[e.category]}</td>
              <td>{e.incurred_on}</td>
              <td className="right">¥{e.amount_jpy.toLocaleString()}</td>
              <td><span className={`badge badge-${e.status}`}>{STATUS_LABEL[e.status]}</span></td>
            </tr>
          ))}
          {submitted.length === 0 && (
            <tr><td colSpan={6} className="muted">承認待ちの申請はありません。</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
