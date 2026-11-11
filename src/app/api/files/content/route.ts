import { NextRequest, NextResponse } from "next/server";
import { readFileSync, existsSync, statSync, realpathSync } from "fs";
import { join, resolve } from "path";

function getAllowedPaths(): string[] {
  try {
    const configPath = join(process.cwd(), "config", "office.json");
    if (existsSync(configPath)) {
      const config = JSON.parse(readFileSync(configPath, "utf8"));
      if (config.fileRoots) return config.fileRoots.map((r: {path: string}) => r.path);
    }
  } catch {}
  const home = process.env.HOME || "/root";
  return [join(home, ".openclaw")];
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const filePath = url.searchParams.get("path");
  
  if (!filePath) {
    return NextResponse.json({ error: "Missing path" }, { status: 400 });
  }
  
  // Normalize and resolve to prevent path traversal
  const resolved = resolve(filePath);
  
  // Check against allowed roots AFTER resolving
  const allowed = getAllowedPaths();
  const isAllowed = allowed.some(root => {
    try {
      const realRoot = realpathSync(root);
      const realFile = existsSync(resolved) ? realpathSync(resolved) : resolved;
      return realFile.startsWith(realRoot + "/") || realFile === realRoot;
    } catch { return false; }
  });
  
  if (!isAllowed) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }
  
  if (!existsSync(resolved)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  
  const stat = statSync(resolved);
  if (stat.size > 1024 * 1024) {
    return NextResponse.json({ error: "File too large" }, { status: 413 });
  }
  
  const content = readFileSync(resolved, "utf8");
  return NextResponse.json({ content, path: resolved });
}
