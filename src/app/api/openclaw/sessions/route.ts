import { NextResponse } from "next/server";
import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { join } from "path";

import { db } from "@/lib/db";
import { agents as agentTable } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

interface AgentMapping {
  [clawId: string]: { id: string; name: string; emoji: string; role: string };
}

const CACHE_TTL_MS = 5000;
let cacheExpiresAt = 0;
let cachedPayload: { agents: Record<string, {
  id: string; name: string; emoji: string; role: string;
  lastActive: number; status: string;
}> } | null = null;

async function getAgentMapping(): Promise<AgentMapping> {
  try {
    const configPath = join(process.cwd(), "config", "office.json");
    if (existsSync(configPath)) {
      const config = JSON.parse(readFileSync(configPath, "utf8"));
      const mapping: AgentMapping = {};
      const agents = await db.select().from(agentTable).where(eq(agentTable.archived, false));
      const clawMapping = config.openclaw?.agentMapping || {};
      
      for (const [clawId, officeId] of Object.entries(clawMapping)) {
        const agent = agents.find((a: {id: string}) => a.id === officeId);
        if (agent) {
          mapping[clawId] = {
            id: agent.id,
            name: agent.name,
            emoji: agent.emoji,
            role: agent.role,
          };
        }
      }
      return mapping;
    }
  } catch {}
  return {};
}

export async function GET() {
  const now = Date.now();
  if (cachedPayload && now < cacheExpiresAt) {
    return NextResponse.json(cachedPayload);
  }

  const mapping = await getAgentMapping();
  const home = process.env.HOME || "/root";
  const sessionsBase = join(home, ".openclaw", "agents");
  
  const result: Record<string, {
    id: string; name: string; emoji: string; role: string;
    lastActive: number; status: string;
  }> = {};
  
  for (const [clawId, info] of Object.entries(mapping)) {
    const sessionDir = join(sessionsBase, clawId, "sessions");
    let lastMtime = 0;
    
    try {
      const files = readdirSync(sessionDir).filter(f => f.endsWith(".jsonl"));
      for (const file of files) {
        const mtime = statSync(join(sessionDir, file)).mtimeMs;
        if (mtime > lastMtime) lastMtime = mtime;
      }
    } catch {}
    
    const age = now - lastMtime;
    let status = "offline";
    if (lastMtime > 0 && age < 5 * 60 * 1000) status = "working";
    else if (lastMtime > 0 && age < 30 * 60 * 1000) status = "idle";
    
    result[info.id] = { ...info, lastActive: lastMtime, status };
  }
  
  cachedPayload = { agents: result };
  cacheExpiresAt = now + CACHE_TTL_MS;
  return NextResponse.json(cachedPayload);
}
