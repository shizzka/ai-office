import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tasks, activityLogs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getAuthUser, unauthorized, forbidden } from "@/lib/auth/middleware";
import { v4 as uuidv4 } from "uuid";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser(request);
    if (!user) return unauthorized();
    if (user.role !== "admin") return forbidden();

    const { id } = await params;
    const { agentId } = await request.json();

    const existing = await db.query.tasks.findFirst({
      where: eq(tasks.id, id),
    });

    if (!existing) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    await db
      .update(tasks)
      .set({ assignedTo: agentId, updatedAt: new Date().toISOString() })
      .where(eq(tasks.id, id));

    await db.insert(activityLogs).values({
      id: uuidv4(),
      entityType: "task",
      entityId: id,
      action: "assigned",
      details: JSON.stringify({ agentId, title: existing.title }),
      userId: user.userId,
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
