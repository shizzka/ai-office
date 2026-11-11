/**
 * Office Configuration — loaded from config/office.json at build time
 * or from API at runtime. No hardcoded agent names.
 */

export interface AgentConfig {
  id: string;
  name: string;
  emoji: string;
  role: string;
  description?: string;
  position: { x: number; y: number };
  isNpc?: boolean;
  voice?: string;
}

export interface OfficeConfig {
  officeName: string;
  domain?: string;
  agents: AgentConfig[];
  openclaw?: {
    sessionsBase: string;
    agentMapping: Record<string, string>;
  };
}

// Default config for development
export const DEFAULT_CONFIG: OfficeConfig = {
  officeName: "AI Office",
  agents: [
    { id: "assistant", name: "Ассистент", emoji: "🎯", role: "Координатор", position: { x: 200, y: 300 } },
    { id: "writer", name: "Копирайтер", emoji: "✍️", role: "Тексты", position: { x: 350, y: 280 } },
    { id: "designer", name: "Дизайнер", emoji: "🎨", role: "Визуал", position: { x: 500, y: 320 } },
  ],
};

export async function getOfficeConfig(): Promise<OfficeConfig> {
  try {
    // Try loading from file system (server-side)
    const fs = await import("fs");
    const path = await import("path");
    const configPath = path.join(process.cwd(), "config", "office.json");
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
      const { db } = await import("./db");
      const { agents } = await import("./db/schema");
      const { eq } = await import("drizzle-orm");
      const active = await db.select().from(agents).where(eq(agents.archived, false));
      return { ...config, agents: active.map((agent) => ({
        ...agent, description: agent.description ?? undefined,
        position: { x: agent.positionX ?? 0, y: agent.positionY ?? 0 },
      })) };
    }
  } catch {
    // Not server-side, try API
  }

  try {
    const res = await fetch("/api/config");
    if (res.ok) {
      return await res.json();
    }
  } catch {}

  return DEFAULT_CONFIG;
}

export function getAgentName(agents: AgentConfig[], id: string): string {
  return agents.find(a => a.id === id)?.name || id;
}

export function getAgentEmoji(agents: AgentConfig[], id: string): string {
  return agents.find(a => a.id === id)?.emoji || "🤖";
}
