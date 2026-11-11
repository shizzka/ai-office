import { NextResponse } from "next/server";
import { readdirSync, statSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { db } from "@/lib/db";
import { agents } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const SESSIONS_BASE = join(process.env.HOME || "/root", ".openclaw", "agents");
// Resolve mappings on every request so archiving/restoring agents also updates totals.
async function getActiveAgentMapping(): Promise<Record<string, string>> {
  const configPath = join(process.cwd(), "config", "office.json");
  if (!existsSync(configPath)) return {};
  const config = JSON.parse(readFileSync(configPath, "utf8"));
  const active = await db.select({ id: agents.id }).from(agents).where(eq(agents.archived, false));
  const activeIds = new Set(active.map((agent) => agent.id));
  const mapping = config.openclaw?.agentMapping || {};
  return Object.fromEntries(Object.entries(mapping).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string" && activeIds.has(entry[1]),
  ));
}

// Opus 4.6 pricing
const INPUT_PRICE_PER_M = 5;
const OUTPUT_PRICE_PER_M = 25;
const CACHE_TTL_MS = 10000;
let cacheExpiresAt = 0;
let cachedMappingKey = "";
let cachedPayload: Record<string, unknown> | null = null;

function scanAgent(agentKey: string) {
  const sessionsPath = join(SESSIONS_BASE, agentKey, "sessions");
  let totalSize = 0;
  let fileCount = 0;
  let newestMs = 0;

  try {
    const files = readdirSync(sessionsPath).filter(f => f.endsWith(".jsonl"));
    for (const f of files) {
      try {
        const st = statSync(join(sessionsPath, f));
        totalSize += st.size;
        fileCount++;
        if (st.mtimeMs > newestMs) newestMs = st.mtimeMs;
      } catch {}
    }
  } catch {}

  // Rough estimate: ~4 chars per token, split 70/30 input/output
  const estimatedTokens = Math.round(totalSize / 4);
  const inputTokens = Math.round(estimatedTokens * 0.7);
  const outputTokens = Math.round(estimatedTokens * 0.3);

  return { totalSize, fileCount, newestMs, estimatedTokens, inputTokens, outputTokens };
}

export async function GET() {
  const now = Date.now();
  let mapping: Record<string, string>;
  try {
    mapping = await getActiveAgentMapping();
  } catch {
    return NextResponse.json({ error: "Unable to resolve active agents" }, { status: 500 });
  }
  const mappingKey = JSON.stringify(Object.entries(mapping).sort());
  if (cachedPayload && mappingKey === cachedMappingKey && now < cacheExpiresAt) {
    return NextResponse.json(cachedPayload);
  }

  let totalTokens = 0;
  let totalInput = 0;
  let totalOutput = 0;
  let totalSessions = 0;
  const perAgent: Record<string, any> = {};

  for (const [agent, agentId] of Object.entries(mapping)) {
    const data = scanAgent(agent);
    totalTokens += data.estimatedTokens;
    totalInput += data.inputTokens;
    totalOutput += data.outputTokens;
    totalSessions += data.fileCount;
    perAgent[agent] = { ...data, agentId };
  }

  const cost = (totalInput / 1_000_000) * INPUT_PRICE_PER_M + (totalOutput / 1_000_000) * OUTPUT_PRICE_PER_M;

  cachedPayload = {
    totalTokens,
    totalInput,
    totalOutput,
    totalSessions,
    cost: Math.round(cost * 100) / 100,
    perAgent,
    pricing: { input: INPUT_PRICE_PER_M, output: OUTPUT_PRICE_PER_M, model: "claude-opus-4-6" },
    estimated: true,
    timestamp: now,
  };
  cachedMappingKey = mappingKey;
  cacheExpiresAt = now + CACHE_TTL_MS;
  return NextResponse.json(cachedPayload);
}
