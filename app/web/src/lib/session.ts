import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { apiFetch } from './api';
import type { Me } from './types';

export async function getCurrentUser(): Promise<Me | null> {
  const token = cookies().get('token')?.value;
  if (!token) return null;
  try {
    return await apiFetch<Me>('/me', { token });
  } catch {
    return null;
  }
}

export async function requireUser(): Promise<Me> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return user;
}
