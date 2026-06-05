import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { getApiBase } from '@/lib/api';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const token = cookies().get('token')?.value;
  if (!token) return new NextResponse('unauthorized', { status: 401 });
  const res = await fetch(`${getApiBase()}/receipts/${params.id}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) return new NextResponse(await res.text(), { status: res.status });
  const headers = new Headers();
  const ct = res.headers.get('content-type');
  if (ct) headers.set('content-type', ct);
  const cd = res.headers.get('content-disposition');
  if (cd) headers.set('content-disposition', cd);
  return new NextResponse(res.body, { status: 200, headers });
}
