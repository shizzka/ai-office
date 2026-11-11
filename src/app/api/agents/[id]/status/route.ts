import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { agents, agentStatusHistory } from "@/lib/db/schema";
import { eq, desc, sql } from "drizzle-orm";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const agent = await db.query.agents.findFirst({
      where: eq(agents.id, id),
    });

    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    const latestHistory = await db
      .select()
      .from(agentStatusHistory)
      .where(eq(agentStatusHistory.agentId, id))
      .orderBy(desc(agentStatusHistory.startedAt), sql`agent_status_history.rowid DESC`)
      .limit(1);

    return NextResponse.json({
      status: agent.currentStatus,
      statusText: latestHistory[0]?.statusText || null,
      lastUpdate: latestHistory[0]?.startedAt || agent.createdAt,
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
