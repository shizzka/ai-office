import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

function readFile(...paths: string[]): string | null {
  for (const p of paths) {
    const resolved = p.startsWith("~") ? p.replace("~", process.env.HOME || "/root") : p;
    try {
      if (fs.existsSync(resolved)) {
        return fs.readFileSync(resolved, "utf-8");
      }
    } catch { /* skip */ }
  }
  return null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const home = process.env.HOME || "/root";

    const soul = readFile(
      path.join(home, ".openclaw/agents", id, "SOUL.md"),
      path.join(home, ".openclaw", "agents", id, "SOUL.md")
    );

    const memory = readFile(
      path.join(home, ".openclaw/agents", id, "MEMORY.md"),
      path.join(home, ".openclaw", "agents", id, "MEMORY.md")
    );

    return NextResponse.json({ soul, memory });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
