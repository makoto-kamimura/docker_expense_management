import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { requireUser } from '@/lib/session';
import {
  deleteExpenseAction,
  submitExpenseAction,
  decideExpenseAction,
  uploadReceiptAction,
} from '@/lib/actions';
import type { Expense, Receipt } from '@/lib/types';
import { CATEGORY_LABEL } from '@/lib/types';
import StatusStepper from '@/components/StatusStepper';
import ReceiptUpload from './receipt-upload';
import DecideForm from './decide-form';

export default async function ExpenseDetail({ params }: { params: { id: string } }) {
  const user = await requireUser();
  const expense = await apiFetch<Expense>(`/expenses/${params.id}`);
  const receipts = await apiFetch<Receipt[]>(`/expenses/${params.id}/receipts`);

  const isOwner = expense.user_id === user.id;
  const canApprove = (user.role === 'approver' || user.role === 'admin') && expense.status === 'submitted';
  const canEdit = isOwner && (expense.status === 'draft' || expense.status === 'rejected');
  const canSubmit = isOwner && (expense.status === 'draft' || expense.status === 'rejected');
  const canDelete = (isOwner || user.role === 'admin') && expense.status !== 'approved';

  return (
    <div>
      <h1>{expense.title}</h1>

      <div className="card">
        <StatusStepper status={expense.status} />
        <table>
          <tbody>
            <tr><th>カテゴリ</th><td>{CATEGORY_LABEL[expense.category]}</td></tr>
            <tr><th>発生日</th><td>{expense.incurred_on}</td></tr>
            <tr><th>金額</th><td>¥{expense.amount_jpy.toLocaleString()}</td></tr>
            <tr><th>説明</th><td style={{ whiteSpace: 'pre-wrap' }}>{expense.description ?? '—'}</td></tr>
            <tr><th>申請日時</th><td>{expense.submitted_at ?? '—'}</td></tr>
            <tr><th>判定日時</th><td>{expense.decided_at ?? '—'}</td></tr>
            <tr><th>判定メモ</th><td>{expense.decision_note ?? '—'}</td></tr>
          </tbody>
        </table>

        <div className="actions">
          {canEdit && <Link className="btn secondary" href={`/expenses/${expense.id}/edit`}>編集</Link>}
          {canSubmit && (
            <form action={submitExpenseAction.bind(null, expense.id)}>
              <button>申請する</button>
            </form>
          )}
          {canDelete && (
            <form action={deleteExpenseAction.bind(null, expense.id)}>
              <button className="danger">削除</button>
            </form>
          )}
          <Link className="btn secondary" href="/expenses">一覧へ戻る</Link>
        </div>
      </div>

      {canApprove && (
        <div className="card">
          <h2>承認/却下</h2>
          <DecideForm expenseId={expense.id} />
        </div>
      )}

      <div className="card">
        <h2>領収書</h2>
        {receipts.length === 0 ? (
          <p className="muted">アップロードされた領収書はありません。</p>
        ) : (
          <ul>
            {receipts.map((r) => (
              <li key={r.id}>
                <a href={`/api/receipts/${r.id}`} target="_blank" rel="noreferrer">
                  {r.file_name}
                </a>{' '}
                <span className="muted">({Math.round(r.byte_size / 1024)} KB, {r.uploaded_at})</span>
              </li>
            ))}
          </ul>
        )}
        {(isOwner || user.role === 'admin') && (
          <ReceiptUpload expenseId={expense.id} />
        )}
      </div>
    </div>
  );
}
