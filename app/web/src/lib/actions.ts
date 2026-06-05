'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { apiFetch, getApiBase } from './api';
import type { Expense, User } from './types';

const COOKIE_NAME = 'token';

function setTokenCookie(token: string) {
  cookies().set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 12,
  });
}

export async function loginAction(formData: FormData): Promise<{ error?: string }> {
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');
  try {
    const res = await fetch(`${getApiBase()}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
      cache: 'no-store',
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      return { error: j.error ?? 'ログインに失敗しました' };
    }
    const data = (await res.json()) as { token: string; user: User };
    setTokenCookie(data.token);
  } catch (e) {
    return { error: (e as Error).message };
  }
  redirect('/');
}

export async function registerAction(formData: FormData): Promise<{ error?: string }> {
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');
  const name = String(formData.get('name') ?? '');
  try {
    const res = await fetch(`${getApiBase()}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name }),
      cache: 'no-store',
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      return { error: j.error ?? '登録に失敗しました' };
    }
    const data = (await res.json()) as { token: string; user: User };
    setTokenCookie(data.token);
  } catch (e) {
    return { error: (e as Error).message };
  }
  redirect('/');
}

export async function logoutAction() {
  cookies().delete(COOKIE_NAME);
  redirect('/login');
}

export async function createExpenseAction(formData: FormData) {
  const payload = {
    title: String(formData.get('title') ?? ''),
    description: String(formData.get('description') ?? '') || null,
    category: String(formData.get('category') ?? 'other'),
    amount_jpy: Number(formData.get('amount_jpy') ?? 0),
    incurred_on: String(formData.get('incurred_on') ?? ''),
  };
  await apiFetch<Expense>('/expenses', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  revalidatePath('/expenses');
  redirect('/expenses');
}

export async function updateExpenseAction(id: string, formData: FormData) {
  const payload = {
    title: String(formData.get('title') ?? ''),
    description: String(formData.get('description') ?? '') || null,
    category: String(formData.get('category') ?? 'other'),
    amount_jpy: Number(formData.get('amount_jpy') ?? 0),
    incurred_on: String(formData.get('incurred_on') ?? ''),
  };
  await apiFetch(`/expenses/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  revalidatePath(`/expenses/${id}`);
  redirect(`/expenses/${id}`);
}

export async function deleteExpenseAction(id: string) {
  await apiFetch(`/expenses/${id}`, { method: 'DELETE' });
  revalidatePath('/expenses');
  redirect('/expenses');
}

export async function submitExpenseAction(id: string) {
  await apiFetch(`/expenses/${id}/submit`, { method: 'POST', body: '{}' });
  revalidatePath(`/expenses/${id}`);
}

export async function decideExpenseAction(
  id: string,
  decision: 'approve' | 'reject',
  formData: FormData,
) {
  const note = String(formData.get('note') ?? '') || null;
  await apiFetch(`/expenses/${id}/${decision}`, {
    method: 'POST',
    body: JSON.stringify({ note }),
  });
  revalidatePath(`/expenses/${id}`);
  revalidatePath('/approvals');
}

export async function uploadReceiptAction(id: string, formData: FormData) {
  const body = new FormData();
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { error: 'ファイルが選択されていません' };
  }
  body.append('file', file, file.name);
  try {
    await apiFetch(`/expenses/${id}/receipts`, { method: 'POST', body });
  } catch (e) {
    return { error: (e as Error).message };
  }
  revalidatePath(`/expenses/${id}`);
  return {};
}
