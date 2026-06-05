import { cookies } from 'next/headers';
import type { Expense, MonthlyReport, User } from './types';

const API_URL = process.env.API_URL ?? 'http://localhost:8080';

export function getApiBase(): string {
  return API_URL;
}

function getToken(): string | undefined {
  return cookies().get('token')?.value;
}

type FetchOpts = RequestInit & { token?: string };

export async function apiFetch<T>(path: string, opts: FetchOpts = {}): Promise<T> {
  const token = opts.token ?? getToken();
  const headers = new Headers(opts.headers ?? {});
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (opts.body && !headers.has('Content-Type') && !(opts.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(`${API_URL}${path}`, {
    ...opts,
    headers,
    cache: 'no-store',
  });
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const data = await res.json();
      if (data?.error) msg = data.error;
    } catch {
      // ignore
    }
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  const ct = res.headers.get('content-type') ?? '';
  if (ct.includes('application/json')) {
    return (await res.json()) as T;
  }
  return (await res.text()) as unknown as T;
}

export const api = {
  me: () => apiFetch<User>('/me'),
  listExpenses: (qs = '') => apiFetch<Expense[]>(`/expenses${qs ? `?${qs}` : ''}`),
  getExpense: (id: string) => apiFetch<Expense>(`/expenses/${id}`),
  listUsers: () => apiFetch<User[]>('/users'),
  monthly: (year: number, month: number, userId?: string) =>
    apiFetch<MonthlyReport>(
      `/reports/monthly?year=${year}&month=${month}${userId ? `&user_id=${userId}` : ''}`,
    ),
};
