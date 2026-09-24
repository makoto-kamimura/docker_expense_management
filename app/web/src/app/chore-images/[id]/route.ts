import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { getApiBase, toLogin } from '@/lib/api';

/** 家事の見本画像を Cookie 認証で API から取得して返すプロキシ */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const token = cookies().get('token')?.value;
  if (!token) return toLogin();
  const res = await fetch(`${getApiBase()}/chore-images/${params.id}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (res.status === 401) return toLogin();
  if (!res.ok) return new NextResponse(null, { status: res.status });
  // 画像は差し替えではなく追加・削除なので、同じ ID の中身は変わらない
  const headers = new Headers({ 'x-content-type-options': 'nosniff', 'cache-control': 'private, max-age=86400' });
  const ct = res.headers.get('content-type');
  if (ct) headers.set('content-type', ct);
  return new NextResponse(res.body, { status: 200, headers });
}
