"use client";

import { useEffect, useState } from "react";

interface AgentInfo {
  id: string;
  name: string;
  emoji: string;
  currentStatus?: string | null;
}

interface ActivityItem {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  details: string | null;
  createdAt: string | null;
}

export default function TickerOverlay() {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [feed, setFeed] = useState<ActivityItem[]>([]);
  const [tokenCount, setTokenCount] = useState(0);
  const [tokenCost, setTokenCost] = useState(0);
  const [now, setNow] = useState(new Date());

  // Clock
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Fetch agents
  useEffect(() => {
    async function fetchAgents() {
      try {
        const res = await fetch("/api/agents");
        if (res.ok) {
          const data = await res.json();
          setAgents(data.agents || data);
        }
      } catch {}
    }
    async function fetchLive() {
      try {
        const res = await fetch("/api/openclaw/live");
        if (res.ok) {
          const data = await res.json();
          if (data.agents) {
            setAgents((prev) =>
              prev.map((a) => {
                const live = data.agents.find((l: any) => l.id === a.id);
                return live ? { ...a, currentStatus: live.status } : a;
              })
            );
          }
        }
      } catch {}
    }
    async function fetchFeed() {
      try {
        const res = await fetch("/api/activity/feed");
        if (res.ok) {
          const data = await res.json();
          setFeed(data.feed || []);
        }
      } catch {}
    }
    async function fetchStats() {
      try {
        const res = await fetch("/api/openclaw/stats?t=" + Date.now());
        if (res.ok) {
          const data = await res.json();
          setTokenCount(data.totalTokens || 0);
          setTokenCost(data.cost || 0);
        }
      } catch {}
    }

    fetchAgents().then(fetchLive);
    fetchFeed();
    fetchStats();

    const i1 = setInterval(() => { fetchLive(); fetchFeed(); }, 10000);
    const i2 = setInterval(fetchStats, 5000);
    return () => { clearInterval(i1); clearInterval(i2); };
  }, []);

  const onlineCount = agents.filter((a) => a.currentStatus && a.currentStatus !== "offline" && a.currentStatus !== "idle").length;
  const workingCount = agents.filter((a) => a.currentStatus === "working" || a.currentStatus === "thinking").length;

  const mskTime = now.toLocaleTimeString("ru", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "Europe/Moscow",
  });

  // Build ticker text — short and clean
  const messages = feed.slice(0, 8).map((item) => {
    const agent = agents.find((a) => a.id === item.entityId);
    const prefix = agent ? `${agent.emoji} ${agent.name}` : "";
    try {
      const details = item.details ? JSON.parse(item.details) : {};
      let msg = details.message || details.statusText || details.title || item.action;
      if (msg.length > 40) msg = msg.slice(0, 40) + "…";
      return `${prefix}: ${msg}`;
    } catch {
      return `${prefix}: ${item.action}`;
    }
  });
  const tickerText = messages.length > 0 ? messages.join("     ★     ") : "Фабрика Контента работает...";

  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        height: 36,
        background: "rgba(10, 10, 10, 0.85)",
        borderTop: "1px solid #2a2a2a",
        display: "flex",
        alignItems: "center",
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        overflow: "hidden",
      }}
    >
      {/* Stats block */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          paddingLeft: 16,
          paddingRight: 16,
          borderRight: "1px solid #2a2a2a",
          height: "100%",
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 11, color: "#ecb00a", fontWeight: 700 }}>{mskTime} MSK</span>
        <span style={{ fontSize: 10, color: "#9ca3af" }}>
          <span style={{ color: "#4ade80" }}>{onlineCount}</span>/{agents.length} агентов
        </span>
        {tokenCount > 0 && (
          <span style={{ fontSize: 10, color: "#9ca3af" }}>
            {(tokenCount / 1000).toFixed(1)}k tok
          </span>
        )}
        {tokenCost > 0 && (
          <span style={{ fontSize: 10, color: "rgba(74, 222, 128, 0.7)" }}>
            ${tokenCost.toFixed(2)}
          </span>
        )}
        {workingCount > 0 && (
          <span style={{ fontSize: 10, color: "#facc15", display: "flex", alignItems: "center", gap: 4 }}>
            <span
              style={{
                width: 6,
                height: 6,
                background: "#facc15",
                borderRadius: "50%",
                animation: "pulse 2s infinite",
              }}
            />
            {workingCount} active
          </span>
        )}
      </div>

      {/* Scrolling ticker */}
      <div style={{ flex: 1, overflow: "hidden", height: "100%", display: "flex", alignItems: "center" }}>
        <div
          style={{
            display: "flex",
            whiteSpace: "nowrap",
            animation: "ticker-scroll 60s linear infinite",
          }}
        >
          <span style={{ fontSize: 11, color: "#c0c4d0", paddingLeft: 24 }}>{tickerText}</span>
          <span style={{ fontSize: 11, color: "#c0c4d0", paddingLeft: 64 }}>{tickerText}</span>
        </div>
      </div>

      <style>{`
        @keyframes ticker-scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { background: transparent !important; overflow: hidden; }
      `}</style>
    </div>
  );
}
