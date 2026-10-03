import { NextResponse, type NextRequest } from 'next/server';
import { COOKIE_NAME, COOKIE_OPTIONS } from '@/lib/auth-cookie';

const API_URL = process.env.API_URL ?? 'http://localhost:8080';
/** 発行からこれ以上たったトークンは、使ったときに新しくする (毎回 API を呼ばないため) */
const REFRESH_AFTER_SECONDS = 24 * 60 * 60;

/** JWT のペイロードの発行時刻。署名の確認は API に任せる */
function issuedAt(token: string): number | null {
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const iat = JSON.parse(atob(part)).iat;
    return typeof iat === 'number' ? iat : null;
  } catch {
    return null;
  }
}

/** 使っている間はログインを延ばす (最後に使ってから14日・ログインから30日まで) */
export async function middleware(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return NextResponse.next();
  const iat = issuedAt(token);
  // 以前のトークンには iat がないので、すぐに更新する
  if (iat && Date.now() / 1000 - iat < REFRESH_AFTER_SECONDS) return NextResponse.next();

  let res: Response;
  try {
    res = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
  } catch {
    return NextResponse.next(); // API に届かないときは今のトークンのまま
  }
  if (res.status === 401) {
    // 期限切れ。このリクエストから未ログインとして扱う
    req.cookies.delete(COOKIE_NAME);
    const next = NextResponse.next({ request: { headers: req.headers } });
    next.cookies.delete(COOKIE_NAME);
    return next;
  }
  if (!res.ok) return NextResponse.next();
  const { token: fresh } = (await res.json()) as { token: string };
  // このリクエストの画面描画でも新しいトークンを使う
  req.cookies.set(COOKIE_NAME, fresh);
  const next = NextResponse.next({ request: { headers: req.headers } });
  next.cookies.set(COOKIE_NAME, fresh, COOKIE_OPTIONS);
  return next;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
