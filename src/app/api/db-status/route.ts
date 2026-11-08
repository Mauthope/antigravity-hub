import { NextResponse } from 'next/server';
import { checkDbStatus } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const status = await checkDbStatus(true);
  return NextResponse.json(status, {
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  });
}

export async function POST() {
  const status = await checkDbStatus(true);
  return NextResponse.json(status, {
    status: status.connected ? 200 : status.configured ? 500 : 200,
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  });
}
