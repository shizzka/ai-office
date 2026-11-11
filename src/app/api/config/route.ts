import { NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

import { db } from "@/lib/db";
import { agents } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  const configPath = join(process.cwd(), "config", "office.json");
  
  if (!existsSync(configPath)) {
    return NextResponse.json(
      { error: "config/office.json not found. Run: npm run setup" },
      { status: 404 }
    );
  }

  try {
    const config = JSON.parse(readFileSync(configPath, "utf8"));
    // Strip sensitive fields
    const { deploy, openclaw, ...safe } = config;
    const activeAgents = await db.select().from(agents).where(eq(agents.archived, false));
    return NextResponse.json({ ...safe, agents: activeAgents.map((agent) => ({
      id: agent.id, name: agent.name, emoji: agent.emoji, role: agent.role,
      description: agent.description,
      position: { x: agent.positionX ?? 0, y: agent.positionY ?? 0 },
    })) });
  } catch {
    return NextResponse.json({ error: "Invalid config" }, { status: 500 });
  }
}
