import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/auth/middleware";

export async function POST(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return unauthorized();

  const response = NextResponse.json({ ok: true });
    response.cookies.delete('ai-office-token');
    return response;
    // Original: return NextResponse.json({ success: true });
}
