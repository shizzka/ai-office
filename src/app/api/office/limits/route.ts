import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { publicQuotas } from '@/components/office/officeHoliday';

export const dynamic = 'force-dynamic';
export async function GET() {
  let value: unknown;
  try {
    const row = db.get<{ value: string }>(sql`SELECT value FROM office_bridge_state WHERE key = 'office13:public'`);
    value = row ? JSON.parse(row.value) : null;
  } catch { /* bridge can start later */ }
  return NextResponse.json(publicQuotas(value), { headers: { 'Cache-Control': 'no-store' } });
}
