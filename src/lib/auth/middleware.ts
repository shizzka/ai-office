import { NextRequest, NextResponse } from "next/server";
import { verifyToken, JwtPayload } from "./jwt";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export type AuthenticatedRequest = NextRequest & {
  user?: JwtPayload;
};

export async function getAuthUser(
  request: NextRequest
): Promise<JwtPayload | null> {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7) : request.cookies.get("ai-office-token")?.value;
  if (!token) return null;
  const payload = verifyToken(token);

  if (!payload) {
    return null;
  }

  const user = await db.query.users.findFirst({
    where: eq(users.id, payload.userId),
  });

  if (!user) {
    return null;
  }

  return payload;
}

export function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export function forbidden() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
