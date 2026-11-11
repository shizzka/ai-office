"use client";

import { create } from "zustand";
import type { Agent } from "@/lib/utils/types";

import { getMCWebSocket } from "@/lib/ws";

let wsInitialized = false;

interface AgentsState {
  agents: Agent[];
  costs: Record<string, number>;
  isLoading: boolean;
  fetchAgents: () => Promise<void>;
  fetchLiveStatus: () => Promise<void>;
  fetchCosts: () => Promise<void>;
}

export const useAgentsStore = create<AgentsState>((set, get) => ({
  agents: [],
  costs: {},
  isLoading: false,

  fetchAgents: async () => {
    if (!wsInitialized) {
      wsInitialized = true;
      const ws = getMCWebSocket();
      ws.on("agents:refresh", () => { void get().fetchAgents(); });
      ws.on("connected", () => { void get().fetchAgents(); });
      ws.connect();
    }
    set({ isLoading: true });
    try {
      const res = await fetch("/api/agents");
      if (res.ok) {
        const data = await res.json();
        const normalized = (data.agents || []).filter((agent: Agent) => !agent.archived).map((agent: Agent) => ({
          ...agent,
          contextPct: agent.contextPct ?? 0,
          statusText: agent.statusText ?? null,
        }));
        set({ agents: normalized, isLoading: false });
      } else {
        set({ isLoading: false });
      }
    } catch {
      set({ isLoading: false });
    }
  },

  // Fetch live status from OpenClaw and merge into existing agents
  fetchLiveStatus: async () => {
    try {
      const res = await fetch("/api/openclaw/sessions");
      if (!res.ok) return;
      const data = await res.json();
      const rawAgents = data.agents || [];
      const liveAgents = Array.isArray(rawAgents)
        ? rawAgents
        : Object.values(rawAgents);

      const current = get().agents;
      const updated = current.map((agent) => {
        const live = (liveAgents as Array<{ id: string; status?: string; statusText?: string; contextPct?: number }>).find(
          (la) => la.id === agent.id
        );
        if (live) {
          const currentStatus = agent.currentStatus || "idle";
          const liveStatus = (live.status || currentStatus) as Agent["currentStatus"];
          // DB status is source of truth for work lifecycle (task dispatch/progress/complete).
          // Use OpenClaw only to revive offline agent when there is a fresh positive signal.
          const mergedStatus =
            currentStatus === "offline" && liveStatus !== "offline"
              ? liveStatus
              : currentStatus;

          return {
            ...agent,
            currentStatus: mergedStatus,
            statusText: agent.statusText ?? live.statusText ?? null,
            contextPct: live.contextPct ?? agent.contextPct ?? 0,
          };
        }
        return agent;
      });

      set({ agents: updated });
    } catch {
      // silent fail — live data is optional
    }
  },

  fetchCosts: async () => {
    try {
      const res = await fetch("/api/openclaw/stats");
      if (!res.ok) return;
      const data = await res.json();
      const perAgent = data.perAgent || {};
      const inputPrice = data.pricing?.input || 5;
      const outputPrice = data.pricing?.output || 25;
      const costMap: Record<string, number> = {};
      for (const stats of Object.values(perAgent) as Array<{ agentId?: string; inputTokens: number; outputTokens: number }>) {
        const agentId = stats?.agentId;
        if (agentId && stats && get().agents.some((agent) => agent.id === agentId)) {
          costMap[agentId] = Math.round(((stats.inputTokens / 1e6) * inputPrice + (stats.outputTokens / 1e6) * outputPrice) * 100) / 100;
        }
      }
      set({ costs: costMap });
    } catch {}
  },
}));
