import { apiFetch } from '@/lib/api';
import { requireUser } from '@/lib/session';
import { updateExpenseAction } from '@/lib/actions';
import { ExpenseForm } from '@/components/ExpenseForm';
import type { Expense } from '@/lib/types';

export default async function EditExpensePage({ params }: { params: { id: string } }) {
  await requireUser();
  const expense = await apiFetch<Expense>(`/expenses/${params.id}`);
  const bound = updateExpenseAction.bind(null, expense.id);

  return (
    <div className="card" style={{ maxWidth: 640 }}>
      <h1>申請の編集</h1>
      <ExpenseForm
        action={bound}
        submitLabel="保存"
        defaults={{
          title: expense.title,
          description: expense.description,
          category: expense.category,
          amount_jpy: expense.amount_jpy,
          incurred_on: expense.incurred_on,
        }}
      />
    </div>
  );
}
