export type UserRole = 'employee' | 'approver' | 'admin';
export type ExpenseStatus = 'draft' | 'submitted' | 'approved' | 'rejected';
export type ExpenseCategory =
  | 'travel' | 'meals' | 'accommodation' | 'supplies'
  | 'entertainment' | 'communication' | 'other';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

export interface Expense {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  category: ExpenseCategory;
  amount_jpy: number;
  incurred_on: string;
  status: ExpenseStatus;
  submitted_at: string | null;
  decided_at: string | null;
  decision_note: string | null;
}

export interface Receipt {
  id: string;
  expense_id: string;
  file_name: string;
  content_type: string;
  byte_size: number;
  uploaded_at: string;
}

export const STATUS_LABEL: Record<ExpenseStatus, string> = {
  draft: '下書き',
  submitted: '申請中',
  approved: '承認済',
  rejected: '却下',
};

export const CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  travel: '交通費',
  meals: '会議費・食事',
  accommodation: '宿泊',
  supplies: '備品',
  entertainment: '交際費',
  communication: '通信費',
  other: 'その他',
};
