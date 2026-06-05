import { apiFetch } from '@/lib/api';
import { requireUser } from '@/lib/session';
import type { MonthlyReport, User } from '@/lib/types';
import { CATEGORY_LABEL } from '@/lib/types';

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: { year?: string; month?: string; user_id?: string };
}) {
  const user = await requireUser();
  const now = new Date();
  const year = Number(searchParams.year ?? now.getFullYear());
  const month = Number(searchParams.month ?? now.getMonth() + 1);
  const isManager = user.role === 'admin' || user.role === 'approver';
  const userId = isManager ? searchParams.user_id ?? '' : '';

  const users: User[] = isManager ? await apiFetch<User[]>('/users') : [];

  const qs = new URLSearchParams({ year: String(year), month: String(month) });
  if (userId) qs.set('user_id', userId);
  const report = await apiFetch<MonthlyReport>(`/reports/monthly?${qs.toString()}`);

  const csvHref = `/api/reports/csv?${qs.toString()}`;

  return (
    <div>
      <h1>月次集計 / CSV出力</h1>

      <form className="card" method="get" action="/reports">
        <div className="row" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <div>
            <label htmlFor="year">年</label>
            <input id="year" name="year" type="number" defaultValue={year} />
          </div>
          <div>
            <label htmlFor="month">月</label>
            <input id="month" name="month" type="number" min={1} max={12} defaultValue={month} />
          </div>
          {isManager && (
            <div>
              <label htmlFor="user_id">対象ユーザ (全員: 空)</label>
              <select id="user_id" name="user_id" defaultValue={userId}>
                <option value="">全員</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
        <div className="actions">
          <button type="submit">集計する</button>
          <a className="btn secondary" href={csvHref}>CSVダウンロード</a>
        </div>
      </form>

      <div className="card">
        <h2>{report.year}年 {report.month}月の承認済み経費</h2>
        <p style={{ fontSize: 22, fontWeight: 700 }}>
          合計: ¥{report.total_jpy.toLocaleString()}
        </p>
        <table>
          <thead>
            <tr>
              <th>カテゴリ</th>
              <th className="right">件数</th>
              <th className="right">合計金額</th>
            </tr>
          </thead>
          <tbody>
            {report.rows.map((r) => (
              <tr key={r.category}>
                <td>{CATEGORY_LABEL[r.category]}</td>
                <td className="right">{r.count}</td>
                <td className="right">¥{r.total_jpy.toLocaleString()}</td>
              </tr>
            ))}
            {report.rows.length === 0 && (
              <tr><td colSpan={3} className="muted">対象データがありません。</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
