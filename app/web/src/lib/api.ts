import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import type { RequestDetail } from './types';

const API_URL = process.env.API_URL ?? 'http://localhost:8080';

export function getApiBase(): string {
  return API_URL;
}

// Route Handler で未ログイン/トークン切れのときにログイン画面へ戻す。
// リバースプロキシ配下なので絶対 URL を組まず相対 Location で返す。
export function toLogin(): Response {
  return new Response(null, { status: 307, headers: { Location: '/login' } });
}

function getToken(): string | undefined {
  return cookies().get('token')?.value;
}

type FetchOpts = RequestInit & { token?: string };

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

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
    throw new ApiError(msg, res.status);
  }
  if (res.status === 204) return undefined as T;
  const ct = res.headers.get('content-type') ?? '';
  if (ct.includes('application/json')) {
    return (await res.json()) as T;
  }
  return (await res.text()) as unknown as T;
}

/** 申請の詳細を取得する。他の家族の申請・他人の下書きは 404 ページにする。 */
export async function getRequestOr404(id: string): Promise<RequestDetail> {
  try {
    return await apiFetch<RequestDetail>(`/requests/${id}`);
  } catch (e) {
    if (e instanceof ApiError && [400, 403, 404].includes(e.status)) notFound();
    throw e;
  }
}
