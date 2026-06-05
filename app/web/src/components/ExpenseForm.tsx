import { CATEGORY_LABEL, type ExpenseCategory } from '@/lib/types';

const CATEGORIES: ExpenseCategory[] = [
  'travel',
  'meals',
  'accommodation',
  'supplies',
  'entertainment',
  'communication',
  'other',
];

export interface ExpenseDraft {
  title?: string;
  description?: string | null;
  category?: ExpenseCategory;
  amount_jpy?: number;
  incurred_on?: string;
}

export function ExpenseForm({
  action,
  defaults,
  submitLabel,
}: {
  action: (fd: FormData) => Promise<unknown>;
  defaults?: ExpenseDraft;
  submitLabel: string;
}) {
  return (
    <form action={action as any}>
      <div className="row">
        <label htmlFor="title">件名</label>
        <input id="title" name="title" required defaultValue={defaults?.title ?? ''} />
      </div>
      <div className="row">
        <label htmlFor="category">カテゴリ</label>
        <select id="category" name="category" defaultValue={defaults?.category ?? 'other'}>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
          ))}
        </select>
      </div>
      <div className="row">
        <label htmlFor="amount_jpy">金額 (円)</label>
        <input
          id="amount_jpy"
          name="amount_jpy"
          type="number"
          min="0"
          required
          defaultValue={defaults?.amount_jpy ?? 0}
        />
      </div>
      <div className="row">
        <label htmlFor="incurred_on">発生日</label>
        <input
          id="incurred_on"
          name="incurred_on"
          type="date"
          required
          defaultValue={defaults?.incurred_on ?? ''}
        />
      </div>
      <div className="row">
        <label htmlFor="description">補足説明</label>
        <textarea id="description" name="description" defaultValue={defaults?.description ?? ''} />
      </div>
      <button type="submit">{submitLabel}</button>
    </form>
  );
}
