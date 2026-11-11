import { jwtVerify } from "jose/jwt/verify";
import { JWT_SECRET } from "./secret";

// Match the office's existing LAN host policy, with exact private IPv4 ranges.
export function isLanHost(host: string): boolean {
  const hostname = host.startsWith("[") ? host.slice(1, host.indexOf("]")) : host.split(":")[0];
  if (["localhost", "127.0.0.1", "::1"].includes(hostname)) return true;
  const octets = hostname.split(".");
  if (octets.length !== 4 || octets.some((s) => !/^\d{1,3}$/.test(s) || Number(s) > 255)) return false;
  const [a, b] = octets.map(Number);
  return a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31);
}

const LAN_READ_PATHS = new Set([
  "/api/tasks", "/api/projects", "/api/agents", "/api/activity/feed",
  "/api/config", "/api/openclaw/sessions", "/api/openclaw/stats",
  "/api/office/moments", "/api/office/limits", "/api/office/dcm", "/api/office/stats",
]);

export function isAnonymousApiRequest(path: string, method: string, host: string): boolean {
  if (path === "/api/auth/login" && method === "POST") return true;
  return method === "GET" && isLanHost(host) && LAN_READ_PATHS.has(path);
}

export async function validAccessToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(JWT_SECRET), {
      algorithms: ["HS256"],
      requiredClaims: ["exp", "userId", "username", "role"],
    });
    return typeof payload.userId === "string" && typeof payload.username === "string" &&
      (payload.role === "admin" || payload.role === "viewer");
  } catch {
    return false;
  }
}
