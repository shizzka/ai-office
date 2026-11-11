"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/authStore";
import { useAgentsStore } from "@/stores/agentsStore";
import { useTasksStore } from "@/stores/tasksStore";
import { AgentSidebar } from "@/components/agents/AgentSidebar";
import { TaskBoard } from "@/components/tasks/TaskBoard";
import { ActivityFeed } from "@/components/activity/ActivityFeed";
import { TaskFormModal } from "@/components/tasks/TaskFormModal";
import { TaskDetailModal } from "@/components/tasks/TaskDetailModal";
import { AgentProfilePanel } from "@/components/agents/AgentProfilePanel";
import { DocsPanel } from "@/components/docs/DocsPanel";
import { ChainPanel } from "@/components/chains/ChainPanel";
import { useUiStore } from "@/stores/uiStore";

const TABS: readonly { id: "office" | "tasks" | "chains" | "docs"; label: string; href?: string }[] = [
  { id: "office", label: "🏠 Офис", href: "/office/stream" },
  { id: "tasks", label: "📋 Задачи" },
  { id: "chains", label: "🔗 Цепочки" },
  { id: "docs", label: "📄 Документы" },
];

export default function AdminPage() {
  const router = useRouter();
  const { user, isLoading, checkAuth } = useAuthStore();
  const { fetchAgents } = useAgentsStore();
  const { fetchTasks, initWS, wsConnected } = useTasksStore();
  const { activeTab, setActiveTab, taskFormOpen, taskDetailId, agentProfileId } = useUiStore();

  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.push("/auth/login");
      return;
    }
    if (user.role !== "admin") {
      router.push("/office/stream");
      return;
    }
    fetchAgents();
    fetchTasks();
    initWS();
  }, [user, isLoading, router, fetchAgents, fetchTasks, initWS]);

  useEffect(() => {
    const interval = setInterval(fetchAgents, 5000);
    return () => clearInterval(interval);
  }, [fetchAgents]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-[#9ba1b5]">Loading...</div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="h-screen flex flex-col bg-[#0a0a12]">
      {/* Header */}
      <header className="h-11 bg-[#0f0f0f] border-b border-[#2a2a2a] flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-lg">📁</span>
          <h1 className="text-base font-bold tracking-wider text-white">
            AI Office <span className="text-[#ecb00a]">DCM Lab · job-hunter</span>
          </h1>
          <span className="text-[10px] text-[#ecb00a] border border-[#ecb00a]/30 bg-[#ecb00a]/10 px-1.5 py-0.5 rounded">
            CONTROL
          </span>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1">
          {TABS.map((tab) =>
            tab.href ? (
              <a
                key={tab.id}
                href={tab.href}
                className="text-[11px] px-3 py-1.5 rounded text-[#9ca3af] hover:text-[#ecb00a] hover:bg-[#ecb00a]/5 transition-colors"
              >
                {tab.label}
              </a>
            ) : (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`text-[11px] px-3 py-1.5 rounded transition-colors ${
                  activeTab === tab.id
                    ? "bg-[#ecb00a]/10 text-[#ecb00a] font-semibold"
                    : "text-[#9ca3af] hover:text-[#ecb00a] hover:bg-[#ecb00a]/5"
                }`}
              >
                {tab.label}
              </button>
            )
          )}
        </div>

        <div className="flex items-center gap-3">
          <a
            href="/office/stream"
            className="text-[10px] px-2 py-1 rounded border border-[#2a2a2a] text-[#9ca3af] hover:text-[#ecb00a] hover:border-[#ecb00a]/30 transition-colors"
          >
            📺 Live
          </a>
          <span className={`text-[10px] flex items-center gap-1 ${wsConnected ? "text-green-400" : "text-[#555]"}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${wsConnected ? "bg-green-400" : "bg-[#555]"}`} />
            {wsConnected ? "Live" : "Offline"}
          </span>
          <span className="text-[10px] text-[#555]">{user.username}</span>
          <button
            onClick={() => {
              useAuthStore.getState().logout();
              router.push("/auth/login");
            }}
            className="text-[10px] text-[#555] hover:text-red-400 transition-colors"
          >
            Выйти
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden" ref={wrapperRef}>
        {/* Left Sidebar - Agents (always visible) */}
        <AgentSidebar />

        {/* Center — tab content */}
        <main className="flex-1 overflow-hidden flex flex-col">
          {activeTab === "tasks" && <TaskBoard />}
          {activeTab === "chains" && <ChainPanel />}
          {activeTab === "docs" && <DocsPanel />}
          {activeTab === "office" && (
            <div className="flex items-center justify-center h-full text-[#555] text-sm">
              <div className="text-center">
                <div className="text-4xl mb-3">🏠</div>
                <div>Пиксельный офис</div>
                <div className="text-xs mt-1">
                  <a href="/office/stream" className="text-[#ecb00a] hover:underline">
                    Открыть в Live режиме →
                  </a>
                </div>
              </div>
            </div>
          )}
        </main>

        {/* Right Panel - Activity Feed */}
        <ActivityFeed />
      </div>

      {/* Modals */}
      {taskFormOpen && <TaskFormModal />}
      {taskDetailId && <TaskDetailModal />}
      {agentProfileId && <AgentProfilePanel />}
    </div>
  );
}
