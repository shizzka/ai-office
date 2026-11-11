import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { publicDcm } from '@/lib/officeDcm';

export const dynamic = 'force-dynamic';
export async function GET() {
  let value: unknown;
  try {
    const row = db.get<{ value: string }>(sql`SELECT value FROM office_bridge_state WHERE key = 'office17:public'`);
    value = row ? JSON.parse(row.value) : null;
  } catch { /* bridge may not be initialized yet */ }
  return NextResponse.json(publicDcm(value), { headers: { 'Cache-Control': 'no-store' } });
}
