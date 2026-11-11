import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { taskLogs, taskComments } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { getAuthUser, unauthorized, forbidden } from "@/lib/auth/middleware";
import { v4 as uuidv4 } from "uuid";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const logs = await db
      .select()
      .from(taskLogs)
      .where(eq(taskLogs.taskId, id))
      .orderBy(desc(taskLogs.createdAt));
    
    const comments = await db
      .select()
      .from(taskComments)
      .where(eq(taskComments.taskId, id))
      .orderBy(desc(taskComments.createdAt));

    // Merge and sort by date
    const merged = [
      ...logs.map(l => ({ ...l, type: "log" as const })),
      ...comments.map(c => ({ 
        id: c.id, 
        taskId: c.taskId, 
        agentId: c.authorType === "agent" ? c.authorId : null,
        message: c.body, 
        createdAt: c.createdAt, 
        type: "comment" as const,
        authorType: c.authorType,
        authorId: c.authorId,
      })),
    ].sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));

    return NextResponse.json({ logs: merged });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser(request);
    if (!user) return unauthorized();
    if (user.role !== "admin") return forbidden();

    const { id } = await params;
    const body = await request.json();
    const { agentId, message } = body;

    if (!message) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    const logId = uuidv4();
    await db.insert(taskLogs).values({
      id: logId,
      taskId: id,
      agentId: agentId || null,
      message,
    });

    const log = await db.query.taskLogs.findFirst({ where: eq(taskLogs.id, logId) });
    return NextResponse.json({ log }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
