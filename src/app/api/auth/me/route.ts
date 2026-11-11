import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/auth/middleware";

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return unauthorized();

  return NextResponse.json({
    user: {
      id: user.userId,
      username: user.username,
      role: user.role,
    },
  });
}
