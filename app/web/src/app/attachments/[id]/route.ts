import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { getApiBase, toLogin } from '@/lib/api';

/** 添付ファイルを Cookie 認証で API から取得して返すプロキシ */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const token = cookies().get('token')?.value;
  if (!token) return toLogin();
  const res = await fetch(`${getApiBase()}/attachments/${params.id}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (res.status === 401) return toLogin();
  if (!res.ok) return new NextResponse(await res.text(), { status: res.status });
  const headers = new Headers({ 'x-content-type-options': 'nosniff' });
  for (const h of ['content-type', 'content-disposition']) {
    const v = res.headers.get(h);
    if (v) headers.set(h, v);
  }
  return new NextResponse(res.body, { status: 200, headers });
}
