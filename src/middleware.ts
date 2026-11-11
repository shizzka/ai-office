import { NextRequest, NextResponse } from "next/server";

import { isAnonymousApiRequest, validAccessToken } from "@/lib/auth/access";

// Rate limiting: simple in-memory store
const rateMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 60; // requests per window
const RATE_WINDOW = 60_000; // 1 minute

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW });
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Security headers on all responses
  const response = NextResponse.next();
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.headers.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws: wss:; font-src 'self';"
  );

  // Pult has its own owner session and API authorization, independent of the
  // office/JH login. Telegram Web uses an iframe; allow only Telegram parents.
  if (pathname === "/pult" || pathname.startsWith("/pult/")) {
    response.headers.delete("X-Frame-Options");
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Content-Security-Policy",
      "default-src 'self'; script-src 'self' 'unsafe-inline' https://telegram.org; " +
      "style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; " +
      "font-src 'self'; object-src 'none'; base-uri 'self'; " +
      "frame-ancestors 'self' https://web.telegram.org https://*.telegram.org;");
    return response;
  }

  // Rate limit API endpoints
  if (pathname.startsWith("/api/")) {
    const ip = request.headers.get("x-forwarded-for") || request.headers.get("cf-connecting-ip") || "unknown";
    if (isRateLimited(ip)) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }
  }

  const isApi = pathname.startsWith("/api/");
  const isAdmin = pathname === "/office/admin" || pathname.startsWith("/office/admin/");
  if (!isApi && !isAdmin) return response;

  if (isApi && isAnonymousApiRequest(pathname, request.method, request.headers.get("host") || "")) {
    return response;
  }

  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7) : request.cookies.get("ai-office-token")?.value;
  if (!(await validAccessToken(token))) {
    if (isApi) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.redirect(new URL("/auth/login", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.svg).*)"],
};
