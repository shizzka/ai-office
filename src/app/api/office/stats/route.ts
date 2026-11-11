import { NextRequest, NextResponse } from 'next/server';
import path from 'node:path';
import { getOfficeStats } from '../../../../../worker/office-engine';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export async function GET(request: NextRequest) {
  const stats = getOfficeStats({
    databasePath: path.resolve(process.cwd(), process.env.DATABASE_URL || './data/database.sqlite'),
    stream: request.nextUrl.searchParams.get('stream') === '1',
  });
  return NextResponse.json(stats, { headers: { 'Cache-Control': 'no-store' } });
}
