import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { projects, activityLogs } from "@/lib/db/schema";
import { getAuthUser, unauthorized, forbidden } from "@/lib/auth/middleware";
import { v4 as uuidv4 } from "uuid";
import { eq } from "drizzle-orm";

export async function GET() {
  try {
    const allProjects = await db.select().from(projects).where(eq(projects.archived, false));
    return NextResponse.json({ projects: allProjects });
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

    const { name, description } = await request.json();

    if (!name) {
      return NextResponse.json(
        { error: "Name is required" },
        { status: 400 }
      );
    }

    const projectId = uuidv4();
    const now = new Date().toISOString();

    await db.insert(projects).values({
      id: projectId,
      name,
      description: description || null,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(activityLogs).values({
      id: uuidv4(),
      entityType: "project",
      entityId: projectId,
      action: "created",
      details: JSON.stringify({ name }),
      userId: user.userId,
    });

    const project = await db.query.projects.findFirst({
      where: (p, { eq }) => eq(p.id, projectId),
    });

    return NextResponse.json({ project }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
