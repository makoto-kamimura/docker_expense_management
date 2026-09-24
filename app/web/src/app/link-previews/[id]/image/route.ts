import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { getApiBase, toLogin } from '@/lib/api';

/** リンク先のプレビュー画像を Cookie 認証で API から取得して返すプロキシ */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const token = cookies().get('token')?.value;
  if (!token) return toLogin();
  const res = await fetch(`${getApiBase()}/link-previews/${params.id}/image`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) return new NextResponse(null, { status: res.status });
  const headers = new Headers({ 'x-content-type-options': 'nosniff', 'cache-control': 'private, max-age=86400' });
  const ct = res.headers.get('content-type');
  if (ct) headers.set('content-type', ct);
  return new NextResponse(res.body, { status: 200, headers });
}
