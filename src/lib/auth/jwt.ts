import jwt from "jsonwebtoken";
import { JWT_SECRET } from "./secret";

export interface JwtPayload {
  userId: string;
  username: string;
  role: "admin" | "viewer";
}

export function signToken(payload: JwtPayload): string {
  // expiresIn as number of seconds (7 days)
  return jwt.sign(payload as object, JWT_SECRET, { expiresIn: 604800 });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}
