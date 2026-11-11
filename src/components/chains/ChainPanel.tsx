"use client";

import { useState, useEffect } from "react";
import { useAgentsStore } from "@/stores/agentsStore";

interface ChainStep {
  agentId: string;
  action: string;
  description?: string;
}

interface Chain {
  id: string;
  name: string;
  description: string;
  steps: ChainStep[];
  createdAt: string;
}

export function ChainPanel() {
  const [chains, setChains] = useState<Chain[]>([]);
  const [selectedChain, setSelectedChain] = useState<Chain | null>(null);
  const [runTitle, setRunTitle] = useState("");
  const [runPriority, setRunPriority] = useState("medium");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const { agents } = useAgentsStore();

  useEffect(() => {
    fetchChains();
  }, []);

  async function fetchChains() {
    try {
      const res = await fetch("/api/chains");
      if (res.ok) {
        const data = await res.json();
        setChains(data.chains || []);
      }
    } catch { /* skip */ }
  }

  async function runChain() {
    if (!selectedChain || !runTitle.trim()) return;
    setRunning(true);
    setResult(null);
    try {
      const res = await fetch(`/api/chains/${selectedChain.id}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: runTitle.trim(), priority: runPriority }),
      });
      const data = await res.json();
      if (data.ok) {
        setResult(`✅ Цепочка запущена! Создано ${data.stepsCount} задач.`);
        setRunTitle("");
      } else {
        setResult(`❌ Ошибка: ${data.error}`);
      }
    } catch (err) {
      setResult(`❌ Ошибка: ${String(err)}`);
    } finally {
      setRunning(false);
    }
  }

  function getAgent(agentId: string) {
    return agents.find(a => a.id === agentId);
  }

  return (
    <div className="h-full flex flex-col p-6 overflow-y-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold text-white">🔗 Цепочки задач</h2>
        <span className="text-xs text-[#555]">{chains.length} цепочек</span>
      </div>

      {/* Chain cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {chains.map(chain => (
          <button
            key={chain.id}
            onClick={() => { setSelectedChain(chain); setResult(null); }}
            className={`text-left p-4 rounded-xl border transition-all ${
              selectedChain?.id === chain.id
                ? "border-[#ecb00a] bg-[#ecb00a]/5"
                : "border-[#2a2a2a] bg-[#141420] hover:border-[#363a4a]"
            }`}
          >
            <div className="font-semibold text-sm text-white mb-1">{chain.name}</div>
            <div className="text-xs text-[#9ba1b5] mb-3">{chain.description}</div>
            <div className="flex items-center gap-1 flex-wrap">
              {chain.steps.map((step, i) => {
                const agent = getAgent(step.agentId);
                return (
                  <div key={i} className="flex items-center gap-1">
                    <span className="text-xs bg-[#252836] px-2 py-0.5 rounded-full text-[#e4e6f0]">
                      {agent?.emoji || "🤖"} {step.action}
                    </span>
                    {i < chain.steps.length - 1 && <span className="text-[#555] text-xs">→</span>}
                  </div>
                );
              })}
            </div>
          </button>
        ))}
      </div>

      {/* Run panel */}
      {selectedChain && (
        <div className="bg-[#141420] border border-[#2a2a2a] rounded-xl p-5">
          <h3 className="text-sm font-bold text-[#ecb00a] mb-4">
            🚀 Запустить: {selectedChain.name}
          </h3>

          {/* Steps preview */}
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            {selectedChain.steps.map((step, i) => {
              const agent = getAgent(step.agentId);
              return (
                <div key={i} className="flex items-center gap-2">
                  <div className="bg-[#252836] rounded-lg p-2 text-center min-w-[80px]">
                    <div className="text-lg">{agent?.emoji || "🤖"}</div>
                    <div className="text-[10px] text-[#9ba1b5] mt-1">{agent?.name || step.agentId}</div>
                    <div className="text-[10px] text-[#e4e6f0] font-medium">{step.action}</div>
                  </div>
                  {i < selectedChain.steps.length - 1 && (
                    <span className="text-[#ecb00a] text-lg">→</span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Input */}
          <div className="flex gap-3 mb-3">
            <input
              value={runTitle}
              onChange={e => setRunTitle(e.target.value)}
              placeholder="Название задачи (например: Пост про AI агентов)"
              className="flex-1 px-3 py-2 bg-[#252836] border border-[#363a4a] rounded-lg text-sm text-[#e4e6f0] focus:outline-none focus:border-[#ecb00a]/50"
            />
            <select
              value={runPriority}
              onChange={e => setRunPriority(e.target.value)}
              className="px-3 py-2 bg-[#252836] border border-[#363a4a] rounded-lg text-sm text-[#e4e6f0]"
            >
              <option value="low">🟢 Низкий</option>
              <option value="medium">⚪ Средний</option>
              <option value="high">🟡 Высокий</option>
              <option value="urgent">🔴 Срочный</option>
            </select>
          </div>

          <button
            onClick={runChain}
            disabled={running || !runTitle.trim()}
            className="px-6 py-2 bg-[#ecb00a] text-[#0a0a12] rounded-lg text-sm font-bold hover:bg-[#d4a00a] disabled:opacity-40 transition-colors"
          >
            {running ? "⏳ Запускаю..." : "🚀 Запустить цепочку"}
          </button>

          {result && (
            <div className={`mt-3 text-sm ${result.startsWith("✅") ? "text-green-400" : "text-red-400"}`}>
              {result}
            </div>
          )}
        </div>
      )}

      {!selectedChain && chains.length > 0 && (
        <div className="text-center text-[#555] text-sm py-8">
          Выберите цепочку для запуска
        </div>
      )}
    </div>
  );
}
