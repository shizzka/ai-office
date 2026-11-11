import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tasks, activityLogs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getAuthUser, unauthorized, forbidden } from "@/lib/auth/middleware";
import { v4 as uuidv4 } from "uuid";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const task = await db.query.tasks.findFirst({
      where: eq(tasks.id, id),
    });

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    return NextResponse.json({ task });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser(request);
    if (!user) return unauthorized();
    if (user.role !== "admin") return forbidden();

    const { id } = await params;
    const body = await request.json();

    const existing = await db.query.tasks.findFirst({
      where: eq(tasks.id, id),
    });

    if (!existing) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (body.status !== undefined) updates.status = body.status;
    if (body.title !== undefined) updates.title = body.title;
    if (body.description !== undefined) updates.description = body.description;
    if (body.assignedTo !== undefined) updates.assignedTo = body.assignedTo;
    if (body.priority !== undefined) updates.priority = body.priority;
    if (body.dueDate !== undefined) updates.dueDate = body.dueDate;
    if (body.projectId !== undefined) updates.projectId = body.projectId;

    await db.update(tasks).set(updates).where(eq(tasks.id, id));

    // Log activity
    await db.insert(activityLogs).values({
      id: uuidv4(),
      entityType: "task",
      entityId: id,
      action: "updated",
      details: JSON.stringify(body),
      userId: user.userId,
    });

    const task = await db.query.tasks.findFirst({
      where: eq(tasks.id, id),
    });

    return NextResponse.json({ task });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser(request);
    if (!user) return unauthorized();
    if (user.role !== "admin") return forbidden();

    const { id } = await params;

    const existing = await db.query.tasks.findFirst({
      where: eq(tasks.id, id),
    });

    if (!existing) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    await db.delete(tasks).where(eq(tasks.id, id));

    // Log activity
    await db.insert(activityLogs).values({
      id: uuidv4(),
      entityType: "task",
      entityId: id,
      action: "deleted",
      details: JSON.stringify({ title: existing.title }),
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
