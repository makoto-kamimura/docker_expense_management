import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { apiFetch } from './api';
import type { User } from './types';

export async function getCurrentUser(): Promise<User | null> {
  const token = cookies().get('token')?.value;
  if (!token) return null;
  try {
    return await apiFetch<User>('/me', { token });
  } catch {
    return null;
  }
}

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return user;
}
