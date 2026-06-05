import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { requireUser } from '@/lib/session';
import type { Expense, ExpenseStatus } from '@/lib/types';
import { CATEGORY_LABEL, STATUS_LABEL } from '@/lib/types';

const STATUSES: (ExpenseStatus | 'all')[] = ['all', 'draft', 'submitted', 'approved', 'rejected'];

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  const user = await requireUser();
  const status = (searchParams.status ?? 'all') as ExpenseStatus | 'all';

  const qs = new URLSearchParams();
  if (user.role === 'employee') qs.set('mine', 'true');
  if (status !== 'all') qs.set('status', status);
  const expenses = await apiFetch<Expense[]>(
    `/expenses${qs.toString() ? `?${qs.toString()}` : ''}`,
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>経費申請一覧</h1>
        <Link className="btn" href="/expenses/new">新規申請</Link>
      </div>

      <div className="card" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={`/expenses${s === 'all' ? '' : `?status=${s}`}`}
            className="btn secondary"
            style={{ background: s === status ? '#e0e7ff' : undefined }}
          >
            {s === 'all' ? '全て' : STATUS_LABEL[s]}
          </Link>
        ))}
      </div>

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
          {expenses.map((e) => (
            <tr key={e.id}>
              <td><Link href={`/expenses/${e.id}`}>{e.title}</Link></td>
              <td>{CATEGORY_LABEL[e.category]}</td>
              <td>{e.incurred_on}</td>
              <td className="right">¥{e.amount_jpy.toLocaleString()}</td>
              <td><span className={`badge badge-${e.status}`}>{STATUS_LABEL[e.status]}</span></td>
            </tr>
          ))}
          {expenses.length === 0 && (
            <tr><td colSpan={5} className="muted">該当する申請がありません。</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
