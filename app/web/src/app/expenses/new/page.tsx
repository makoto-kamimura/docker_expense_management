import { createExpenseAction } from '@/lib/actions';
import { requireUser } from '@/lib/session';
import { ExpenseForm } from '@/components/ExpenseForm';

export default async function NewExpensePage() {
  await requireUser();
  return (
    <div className="card" style={{ maxWidth: 640 }}>
      <h1>新規申請</h1>
      <ExpenseForm action={createExpenseAction} submitLabel="下書きとして保存" />
    </div>
  );
}
