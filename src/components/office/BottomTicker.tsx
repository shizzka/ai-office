"use client";

import { useEffect, useState, useRef } from "react";

interface TickerProps {
  feed: Array<{
    id: string;
    entityType: string;
    entityId: string;
    action: string;
    details: string | null;
    createdAt: string | null;
  }>;
  agents: Array<{
    id: string;
    name: string;
    emoji: string;
    currentStatus?: string | null;
  }>;
  tokenCount: number;
  tokenCost: number;
  onlineCount: number;
  totalCount: number;
}

export function BottomTicker({ feed, agents, tokenCount, tokenCost, onlineCount, totalCount }: TickerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(new Date());

  // Update clock every second
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Build ticker messages from feed
  function getTickerMessages(): string[] {
    return feed.slice(0, 20).map((item) => {
      const agent = agents.find((a) => a.id === item.entityId);
      const prefix = agent ? `${agent.emoji} ${agent.name}` : item.entityId;
      try {
        const details = item.details ? JSON.parse(item.details) : {};
        const msg = details.message || details.statusText || details.title || `${item.action}`;
        return `${prefix}: ${msg}`;
      } catch {
        return `${prefix}: ${item.action}`;
      }
    });
  }

  const messages = getTickerMessages();
  const tickerText = messages.length > 0
    ? messages.join("   ★   ")
    : "Фабрика Контента работает...";

  const workingAgents = agents.filter(a => a.currentStatus === "working" || a.currentStatus === "thinking");

  const mskTime = now.toLocaleTimeString("ru", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "Europe/Moscow",
  });

  return (
    <div className="h-8 bg-[#0a0a0a] border-t border-[#2a2a2a] flex items-center shrink-0 overflow-hidden">
      {/* Left: Stats */}
      <div className="flex items-center gap-4 px-4 shrink-0 border-r border-[#2a2a2a] h-full">
        <span className="text-[10px] text-[#ecb00a] font-mono font-bold">{mskTime} MSK</span>
        <span className="text-[10px] text-[#9ca3af] font-mono">
          <span className="text-green-400">{onlineCount}</span>/{totalCount} агентов
        </span>
        {tokenCount > 0 && (
          <span className="text-[10px] text-[#9ca3af] font-mono">
            {(tokenCount / 1000).toFixed(1)}k tok
          </span>
        )}
        {tokenCost > 0 && (
          <span className="text-[10px] text-green-400/70 font-mono">
            ${tokenCost.toFixed(2)}
          </span>
        )}
        {workingAgents.length > 0 && (
          <span className="text-[10px] text-yellow-400 font-mono flex items-center gap-1">
            <span className="w-1.5 h-1.5 bg-yellow-400 rounded-full animate-pulse" />
            {workingAgents.length} active
          </span>
        )}
      </div>

      {/* Right: Scrolling ticker */}
      <div className="flex-1 overflow-hidden relative h-full flex items-center">
        <div
          ref={scrollRef}
          className="ticker-scroll whitespace-nowrap text-[11px] text-[#c0c4d0] font-mono"
        >
          <span className="inline-block ticker-content">
            {tickerText}
          </span>
          <span className="inline-block ticker-content ml-16">
            {tickerText}
          </span>
        </div>
      </div>
    </div>
  );
}
