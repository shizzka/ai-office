import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tasks, activityLogs } from "@/lib/db/schema";
import { visibleTasks } from "@/lib/db/visibility";
import { eq, and, desc } from "drizzle-orm";
import { getAuthUser, unauthorized, forbidden } from "@/lib/auth/middleware";
import { v4 as uuidv4 } from "uuid";

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const assignee = url.searchParams.get("assignee");
    const projectId = url.searchParams.get("project");

    const conditions = [visibleTasks];
    if (status) conditions.push(eq(tasks.status, status as "todo" | "in_progress" | "review" | "done"));
    if (assignee) conditions.push(eq(tasks.assignedTo, assignee));
    if (projectId) conditions.push(eq(tasks.projectId, projectId));

    let query = db.select().from(tasks);
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    const allTasks = await query.orderBy(desc(tasks.createdAt));
    return NextResponse.json({ tasks: allTasks, total: allTasks.length });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return unauthorized();
    if (user.role !== "admin") return forbidden();

    const body = await request.json();
    const { title, description, assignedTo, projectId, priority, dueDate } = body;

    if (!title) {
      return NextResponse.json(
        { error: "Title is required" },
        { status: 400 }
      );
    }

    const taskId = uuidv4();
    const now = new Date().toISOString();

    await db.insert(tasks).values({
      id: taskId,
      title,
      description: description || null,
      assignedTo: assignedTo || null,
      projectId: projectId || null,
      priority: priority || "medium",
      dueDate: dueDate || null,
      status: assignedTo && assignedTo !== "vanya" ? "assigned" : "todo",
      createdBy: user.userId,
      createdAt: now,
      updatedAt: now,
    });

    // Log activity
    await db.insert(activityLogs).values({
      id: uuidv4(),
      entityType: "task",
      entityId: taskId,
      action: "created",
      details: JSON.stringify({ title, assignedTo, priority }),
      userId: user.userId,
    });

    const task = await db.query.tasks.findFirst({
      where: eq(tasks.id, taskId),
    });

    return NextResponse.json({ task }, { status: 201 });
  } catch (err) {
    console.error("POST /api/tasks error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
