"use client";

import { useState, useEffect } from "react";
import { useAgentsStore } from "@/stores/agentsStore";
import { useUiStore } from "@/stores/uiStore";
import { AgentLog } from "./AgentLog";

const statusLabels: Record<string, string> = {
  working: "Работает",
  thinking: "Думает",
  busy: "Занят",
  idle: "Свободен",
  offline: "Офлайн",
};

const statusColors: Record<string, string> = {
  working: "bg-green-400",
  thinking: "bg-[#ecb00a]",
  busy: "bg-red-400",
  idle: "bg-[#555]",
  offline: "bg-[#333]",
};

export function AgentProfilePanel() {
  const { agentProfileId, closeAgentProfile, openTaskForm } = useUiStore();
  const { agents } = useAgentsStore();
  const agent = agents.find((a) => a.id === agentProfileId);

  const [soul, setSoul] = useState<string | null>(null);
  const [memory, setMemory] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"profile" | "log">("profile");

  useEffect(() => {
    if (agentProfileId) {
      setLoading(true);
      setSoul(null);
      setMemory(null);
      fetch(`/api/agents/${agentProfileId}/profile`)
        .then((r) => r.json())
        .then((data) => {
          setSoul(data.soul || null);
          setMemory(data.memory || null);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [agentProfileId]);

  if (!agentProfileId || !agent) return null;

  const status = agent.currentStatus || "idle";

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 z-40" onClick={closeAgentProfile} />

      {/* Slide panel */}
      <div className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-[#12121c] border-l border-[#2a2a3a] z-50 flex flex-col shadow-2xl animate-slide-in">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#2a2a3a] shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{agent.emoji}</span>
            <div>
              <div className="font-semibold text-lg">{agent.name}</div>
              <div className="text-xs text-[#9ba1b5]">{agent.role}</div>
            </div>
          </div>
          <button onClick={closeAgentProfile} className="text-[#9ba1b5] hover:text-white text-xl">&times;</button>
        </div>

        {/* Status */}
        <div className="px-6 py-3 border-b border-[#2a2a3a] flex items-center gap-2 shrink-0">
          <span className={`w-2 h-2 rounded-full ${statusColors[status]}`} />
          <span className="text-sm text-[#9ba1b5]">{statusLabels[status]}</span>
          {agent.description && (
            <span className="text-xs text-[#555] ml-2">— {agent.description}</span>
          )}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[#2a2a3a] px-6 shrink-0">
          {([["profile", "📋 Профиль"], ["log", "💬 Лог"]] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`text-xs px-3 py-2 border-b-2 transition-colors ${
                tab === id
                  ? "border-[#ecb00a] text-[#ecb00a]"
                  : "border-transparent text-[#555] hover:text-[#9ba1b5]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        {tab === "log" ? (
          <AgentLog
            agentId={agent.id}
            agentName={agent.name}
            agentEmoji={agent.emoji}
            onClose={closeAgentProfile}
          />
        ) : (
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {loading && <div className="text-xs text-[#555] text-center py-8">Загрузка...</div>}

          {/* SOUL.md */}
          {soul && (
            <div>
              <h4 className="text-xs font-semibold text-[#ecb00a] uppercase tracking-wider mb-2">🧠 SOUL.md</h4>
              <pre className="text-xs text-[#c8cad8] bg-[#1e1e2a] rounded-lg p-3 whitespace-pre-wrap max-h-64 overflow-y-auto leading-relaxed">
                {soul}
              </pre>
            </div>
          )}

          {/* MEMORY.md */}
          {memory && (
            <div>
              <h4 className="text-xs font-semibold text-[#ecb00a] uppercase tracking-wider mb-2">💾 MEMORY.md</h4>
              <pre className="text-xs text-[#c8cad8] bg-[#1e1e2a] rounded-lg p-3 whitespace-pre-wrap max-h-64 overflow-y-auto leading-relaxed">
                {memory}
              </pre>
            </div>
          )}

          {!loading && !soul && !memory && (
            <div className="text-xs text-[#555] text-center py-8">
              Файлы SOUL.md и MEMORY.md не найдены для этого агента
            </div>
          )}
        </div>
        )}

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#2a2a3a] shrink-0">
          <button
            onClick={() => {
              closeAgentProfile();
              openTaskForm(agent.id);
            }}
            className="w-full py-2.5 bg-[#ecb00a] hover:bg-[#d4a00a] text-[#0a0a12] rounded-lg text-sm font-semibold transition-colors"
          >
            📋 Дать задачу
          </button>
        </div>
      </div>
    </>
  );
}
