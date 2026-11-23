import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { getApiBase } from '@/lib/api';
import { COOKIE_NAME, COOKIE_OPTIONS } from '@/lib/auth-cookie';
import { PKCE_COOKIE, PKCE_COOKIE_OPTIONS, decodePkce } from '@/lib/sso-auth';

function redirectTo(location: string): NextResponse {
  const res = new NextResponse(null, { status: 303, headers: { Location: location } });
  // code_verifier は 1 回しか使わない
  res.cookies.set(PKCE_COOKIE, '', { ...PKCE_COOKIE_OPTIONS, maxAge: 0 });
  return res;
}

function failed(mode: 'login' | 'link', reason: string): NextResponse {
  const r = encodeURIComponent(reason);
  return mode === 'link' ? redirectTo(`/settings?sso_error=${r}#sso`) : redirectTo(`/login?sso_error=${r}`);
}

/**
 * 認証サーバーから API を経由して戻ってくる。結果コードと Cookie の code_verifier を API で交換する。
 * GET /auth/sso/complete?code=… | ?error=…
 */
export async function GET(req: NextRequest) {
  const pkce = decodePkce((await cookies()).get(PKCE_COOKIE)?.value);
  // Cookie がない = このブラウザで始めた流れではない (または 10 分を過ぎた)
  if (!pkce) return failed('login', 'expired');
  const error = req.nextUrl.searchParams.get('error');
  const code = req.nextUrl.searchParams.get('code');
  if (error || !code) return failed(pkce.mode, error ?? 'failed');

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (pkce.mode === 'link') {
    const token = (await cookies()).get(COOKIE_NAME)?.value;
    if (!token) return redirectTo('/login');
    headers.Authorization = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(`${getApiBase()}/auth/sso/exchange`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ code, code_verifier: pkce.verifier }),
      cache: 'no-store',
    });
  } catch {
    return failed(pkce.mode, 'failed');
  }
  if (!res.ok) {
    if (res.status === 409) return failed(pkce.mode, 'conflict');
    if (res.status === 400) return failed(pkce.mode, 'demo');
    return failed(pkce.mode, 'failed');
  }

  if (pkce.mode === 'link') return redirectTo('/settings?sso=linked#sso');

  const data = (await res.json()) as { token?: string };
  if (!data.token) return failed('login', 'failed');
  const out = redirectTo('/chores');
  out.cookies.set(COOKIE_NAME, data.token, COOKIE_OPTIONS);
  return out;
}
