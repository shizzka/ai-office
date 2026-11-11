import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { agents, agentStatusHistory } from "@/lib/db/schema";
import { desc, eq, sql } from "drizzle-orm";

import { refreshOffice9Roster } from "@/lib/office9Roster";

export async function GET() {
  try {
    const owner = await refreshOffice9Roster();
    const allAgents = await db.select().from(agents).where(eq(agents.archived, false));
    const history = await db
      .select({
        agentId: agentStatusHistory.agentId,
        statusText: agentStatusHistory.statusText,
      })
      .from(agentStatusHistory)
      .orderBy(desc(agentStatusHistory.startedAt), sql`agent_status_history.rowid DESC`);

    const latestStatusText = new Map<string, string | null>();
    for (const row of history) {
      if (!latestStatusText.has(row.agentId)) {
        latestStatusText.set(row.agentId, row.statusText);
      }
    }

    const enrichedAgents = allAgents.map((agent) => {
      const enriched = { ...agent, statusText: latestStatusText.get(agent.id) ?? null };
      if (agent.id === 'office-owner') return { ...enriched, ...owner };
      if (agent.id === 'office-marina') return { ...enriched, currentStatus: 'idle', statusText: 'ждёт сборку на стенде' };
      if (['office-korzhik', 'office-masyanya'].includes(agent.id)) return { ...enriched, statusText: 'отдел критического тестирования · дом котов' };
      return enriched;
    });

    return NextResponse.json({ agents: enrichedAgents }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
