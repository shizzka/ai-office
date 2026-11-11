import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { agents } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getAuthUser, unauthorized, forbidden } from "@/lib/auth/middleware";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser(request);
    if (!user) return unauthorized();
    if (user.role !== "admin") return forbidden();

    const { id } = await params;
    const { x, y } = await request.json();

    if (typeof x !== "number" || typeof y !== "number") {
      return NextResponse.json(
        { error: "x and y must be numbers" },
        { status: 400 }
      );
    }

    await db
      .update(agents)
      .set({ positionX: x, positionY: y })
      .where(eq(agents.id, id));

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
