import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { activityLogs } from "@/lib/db/schema";
import { visibleActivity } from "@/lib/db/visibility";
import { desc, eq, and, sql } from "drizzle-orm";

const CACHE_TTL_MS = 2000;
let cacheExpiresAt = 0;
let cachedPayload: { feed: unknown[] } | null = null;

export async function GET() {
  const now = Date.now();
  if (cachedPayload && now < cacheExpiresAt) {
    return NextResponse.json(cachedPayload, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET",
      },
    });
  }

  try {
    const feed = await db
      .select()
      .from(activityLogs)
      .where(and(visibleActivity, eq(activityLogs.entityType, "agent")))
      .orderBy(desc(activityLogs.createdAt), sql`activity_logs.rowid DESC`)
      .limit(20);

    cachedPayload = { feed };
    cacheExpiresAt = now + CACHE_TTL_MS;
    return NextResponse.json(cachedPayload, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function OPTIONS() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET',
    },
  });
}
