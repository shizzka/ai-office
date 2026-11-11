"use client";

import { useEffect, useState } from "react";
import { useAgentsStore } from "@/stores/agentsStore";
import { getMCWebSocket } from "@/lib/ws";

interface ActivityItem {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  details: string | null;
  createdAt: string | null;
}

const actionIcons: Record<string, string> = {
  created: "➕",
  updated: "✏️",
  deleted: "🗑️",
  completed: "✅",
  assigned: "👤",
  status_changed: "🔄",
  info: "ℹ️",
};

export function ActivityFeed() {
  const { agents } = useAgentsStore();
  const [activities, setActivities] = useState<ActivityItem[]>([]);

  useEffect(() => {
    fetchActivities();
    const interval = setInterval(fetchActivities, 10000);
    const ws = getMCWebSocket();
    const unsubscribe = ws.on("activity:new", () => { void fetchActivities(); });
    return () => { clearInterval(interval); unsubscribe(); };
  }, []);

  async function fetchActivities() {
    try {
      const res = await fetch("/api/activity?limit=30");
      if (res.ok) {
        const data = await res.json();
        setActivities(data.activities);
      }
    } catch {
      // ignore
    }
  }

  function getMessage(item: ActivityItem): string {
    try {
      const details = item.details ? JSON.parse(item.details) : {};
      const agent = agents.find((a) => a.id === item.entityId);
      const prefix = item.entityType === "agent"
        ? `${agent?.name || details.agentName || item.entityId}: `
        : "";
      if (details.message) return `${prefix}${details.message}`;
      if (details.statusText) return `${prefix}${details.statusText}`;
      if (details.title) {
        return `Task "${details.title}" ${item.action}`;
      }
      return `${item.entityType} ${item.action}`;
    } catch {
      return `${item.entityType} ${item.action}`;
    }
  }

  function timeAgo(dateStr: string | null): string {
    if (!dateStr) return "";
    // SQLite CURRENT_TIMESTAMP is UTC but omits its timezone suffix.
    const timestamp = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(dateStr)
      ? `${dateStr.replace(" ", "T")}Z`
      : dateStr;
    const diff = Date.now() - new Date(timestamp).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }

  const [collapsed, setCollapsed] = useState(false);

  if (collapsed) {
    return (
      <aside className="w-8 bg-[#0a0a12] border-l border-[#1a1a2e] flex flex-col items-center shrink-0">
        <button
          onClick={() => setCollapsed(false)}
          className="mt-2 text-[#555] hover:text-[#ecb00a] transition-colors text-xs"
          title="Показать активность"
        >
          ◀
        </button>
        <div className="mt-2 text-[10px] text-[#555] [writing-mode:vertical-rl] rotate-180 tracking-widest">
          АКТИВНОСТЬ
        </div>
      </aside>
    );
  }

  return (
    <aside className="w-64 bg-[#0a0a12] border-l border-[#1a1a2e] flex flex-col shrink-0">
      <div className="px-3 py-2.5 border-b border-[#1a1a2e] flex items-center justify-between">
        <h3 className="text-[10px] text-[#555] uppercase tracking-widest">
          Активность
        </h3>
        <button
          onClick={() => setCollapsed(true)}
          className="text-[#555] hover:text-[#ecb00a] transition-colors text-xs"
          title="Свернуть"
        >
          ▶
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {activities.map((item) => (
          <div
            key={item.id}
            className="flex gap-3 text-sm group"
          >
            <span className="text-base shrink-0 mt-0.5">
              {actionIcons[item.action] || "📋"}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-[#e4e6f0] text-xs leading-relaxed">
                {getMessage(item)}
              </div>
              <div className="text-[10px] text-[#9ba1b5] mt-0.5">
                {timeAgo(item.createdAt)}
              </div>
            </div>
          </div>
        ))}
        {activities.length === 0 && (
          <div className="text-center text-sm text-[#9ba1b5] py-8">
            No activity yet
          </div>
        )}
      </div>
    </aside>
  );
}
