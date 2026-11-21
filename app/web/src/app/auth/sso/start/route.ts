import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { ApiError, apiFetch } from '@/lib/api';
import { COOKIE_NAME } from '@/lib/auth-cookie';
import { PKCE_COOKIE, PKCE_COOKIE_OPTIONS, challengeOf, createVerifier, encodePkce } from '@/lib/sso-auth';

// リバースプロキシ配下なので、絶対 URL を組まずに相対の Location で返す (lib/api.ts の toLogin と同じ)
function redirectTo(location: string): NextResponse {
  return new NextResponse(null, { status: 303, headers: { Location: location } });
}

/**
 * SSO でのログイン / 連携を始める。code_verifier を作って Cookie に持ち、API の開始 URL へ送る。
 * GET /auth/sso/start?mode=login | link
 */
export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get('mode') === 'link' ? 'link' : 'login';
  const verifier = createVerifier();
  const params = new URLSearchParams({ mode, client: 'web', code_challenge: challengeOf(verifier) });

  if (mode === 'link') {
    // 連携はログイン中の本人だけ。ブラウザの遷移では Bearer を送れないので、先に intent を取る
    const token = cookies().get(COOKIE_NAME)?.value;
    if (!token) return redirectTo('/login');
    try {
      const { intent } = await apiFetch<{ intent: string }>('/me/identities/sso/intent', {
        method: 'POST',
        body: '{}',
        token,
      });
      params.set('intent', intent);
    } catch (e) {
      const reason = e instanceof ApiError && e.status === 400 ? 'demo' : 'failed';
      return redirectTo(`/settings?sso_error=${reason}#sso`);
    }
  }

  const res = redirectTo(`/api/auth/sso/start?${params}`);
  res.cookies.set(PKCE_COOKIE, encodePkce(mode, verifier), PKCE_COOKIE_OPTIONS);
  return res;
}
