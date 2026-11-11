import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { agents, activityLogs, agentStatusHistory } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { agentId, action, message, status } = body;

    if (!agentId || !action || !message) {
      return NextResponse.json(
        { error: "agentId, action, message are required" },
        { status: 400 }
      );
    }

    // Check agent exists
    const agent = await db.select().from(agents).where(eq(agents.id, agentId)).then(r => r[0]);
    if (!agent) {
      return NextResponse.json({ error: `Agent '${agentId}' not found` }, { status: 404 });
    }

    // Write activity log
    const logId = uuidv4();
    await db.insert(activityLogs).values({
      id: logId,
      entityType: "agent",
      entityId: agentId,
      action,
      details: JSON.stringify({ message, source: "content-factory" }),
    });

    // Optionally update agent status
    if (status && ["idle", "working", "thinking", "busy", "offline"].includes(status)) {
      await db.update(agents).set({ currentStatus: status as any }).where(eq(agents.id, agentId));

      await db.insert(agentStatusHistory).values({
        id: uuidv4(),
        agentId,
        status,
        statusText: message,
      });
    }

    return NextResponse.json({ ok: true, logId });
  } catch (e) {
    console.error("[activity/log]", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
