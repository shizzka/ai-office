import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { signToken } from "@/lib/auth/jwt";

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json(
        { error: "Username and password are required" },
        { status: 400 }
      );
    }

    const user = await db.query.users.findFirst({
      where: eq(users.username, username),
    });

    if (!user) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      );
    }

    const passwordValid = bcrypt.compareSync(password, user.passwordHash);
    if (!passwordValid) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      );
    }

    const token = signToken({
      userId: user.id,
      username: user.username,
      role: user.role as "admin" | "viewer",
    });

    const response = NextResponse.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
      },
    });
    
    response.cookies.set('ai-office-token', token, {
      httpOnly: true,
      secure: request.nextUrl.protocol === 'https:',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 3600,
    });
    
    return response;
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
