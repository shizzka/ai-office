import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { activityLogs } from "@/lib/db/schema";
import { visibleActivity } from "@/lib/db/visibility";
import { eq, desc, count, and, sql } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const type = url.searchParams.get("type");
    const limit = parseInt(url.searchParams.get("limit") || "50");
    const offset = parseInt(url.searchParams.get("offset") || "0");

    const condition = type ? and(visibleActivity, eq(activityLogs.entityType, type)) : visibleActivity;
    const query = db.select().from(activityLogs).where(condition);

    const activities = await query
      .orderBy(desc(activityLogs.createdAt), sql`activity_logs.rowid DESC`)
      .limit(limit)
      .offset(offset);

    const [totalResult] = await db.select({ count: count() }).from(activityLogs).where(condition);

    return NextResponse.json({
      activities,
      total: totalResult.count,
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
