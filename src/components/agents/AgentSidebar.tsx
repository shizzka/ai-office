"use client";

import { useAgentsStore } from "@/stores/agentsStore";
import { useUiStore } from "@/stores/uiStore";

import { useOfficeHoliday } from '@/components/office/useOfficeHoliday';
import { heroHoliday, holidayLabel, quotaWarning } from '@/components/office/officeHoliday';
import { panelAgent } from '@/components/office/jhBoard';
import { useOfficePresenceStore } from '@/stores/officePresenceStore';
import { normalizeHeroName } from '@/components/office/heroRegistry';

const statusDotColors: Record<string, string> = {
  working: "bg-green-400",
  thinking: "bg-[#ecb00a]",
  busy: "bg-red-400",
  idle: "bg-[#555]",
  offline: "bg-[#333]",
};

const statusLabels: Record<string, string> = {
  working: "Работает",
  thinking: "Думает",
  busy: "Занят",
  idle: "Idle",
  offline: "Offline",
};

export function AgentSidebar() {
  const { agents: sourceAgents, costs } = useAgentsStore();
  const { holiday } = useOfficeHoliday();
  const presence=useOfficePresenceStore(s=>s.presence);
  const agents = sourceAgents.map(source => {
    const agent = panelAgent(source);
    const away = heroHoliday(agent.name, holiday);
    return { ...agent, onHoliday: !!away, atHome:!away&&presence[normalizeHeroName(agent.name)]==='home', rushing:!away&&presence[normalizeHeroName(agent.name)]==='rushing', statusText: away ? holidayLabel(away) : agent.statusText,
      quotaWarning: normalizeHeroName(agent.name) === 'леха' ? quotaWarning(holiday) : null };
  });
  const { openTaskForm, openAgentProfile } = useUiStore();

  const online = agents.filter((a) => a.currentStatus !== "offline").length;

  return (
    <aside className="w-56 bg-[#0a0a12] border-r border-[#1a1a2e] flex flex-col shrink-0">
      {/* Quick Actions */}
      <div className="p-3 border-b border-[#1a1a2e]">
        <button
          onClick={() => openTaskForm()}
          className="w-full py-2 px-3 bg-[#ecb00a] hover:bg-[#d4a00a] text-[#0a0a12] rounded text-xs font-semibold transition-colors"
        >
          + Новая задача
        </button>
      </div>

      {/* Agent List */}
      <div className="flex-1 overflow-y-auto p-3">
        <div className="text-[10px] text-[#555] uppercase tracking-widest mb-3">
          Агенты • {online}/{agents.length}
        </div>
        <div className="space-y-1">
          {agents.map((agent) => (
            <div
              key={agent.id}
              onClick={() => openAgentProfile(agent.id)}
              className="rounded px-2.5 py-2 hover:bg-[#111118] transition-colors cursor-pointer group"
            >
              <div className="flex items-center gap-2.5">
                <span className="text-base">{agent.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-xs text-[#e4e6f0] truncate">
                    {agent.name}
                  </div>
                  <div className="text-[10px] text-[#555] truncate">
                    {agent.role}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${agent.onHoliday ? "bg-[#93afc2]" : statusDotColors[agent.currentStatus || "idle"]}`} />
                    <span className="text-[10px] text-[#555]">
                      {agent.onHoliday ? "Выходной" : agent.atHome ? "🏠 дома" : agent.rushing ? "🏃 в офис" : statusLabels[agent.currentStatus || "idle"]}
                    </span>
                  </div>
                  {(costs[agent.id] ?? 0) > 0 && (
                    <span className="text-[9px] text-[#ecb00a] font-mono">
                      ${costs[agent.id]}
                    </span>
                  )}
                </div>
              </div>
              {agent.quotaWarning && <div className="mt-1 text-[10px] text-[#d9be84]">⛽ {agent.quotaWarning}</div>}
              {agent.statusText && <div className={`mt-1 text-[10px] text-[#9ba1b5] ${agent.name === "Шарик" ? "whitespace-normal leading-relaxed" : "truncate"}`} title={agent.statusText}>{agent.statusText}</div>}
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
