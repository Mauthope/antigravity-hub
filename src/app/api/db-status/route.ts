import { NextResponse } from 'next/server';
import { checkDbStatus } from '@/lib/db';

export async function GET() {
  const status = await checkDbStatus();
  return NextResponse.json(status);
}
