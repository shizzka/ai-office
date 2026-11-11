import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { agentStatusHistory } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get("limit") || "100");

    const history = await db
      .select()
      .from(agentStatusHistory)
      .where(eq(agentStatusHistory.agentId, id))
      .orderBy(desc(agentStatusHistory.startedAt))
      .limit(limit);

    return NextResponse.json({ history });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
