"use client";

import { create } from "zustand";

type AdminTab = "office" | "tasks" | "chains" | "docs";

interface UiState {
  activeTab: AdminTab;
  sidebarOpen: boolean;
  taskFormOpen: boolean;
  taskFormPrefilledAgent: string | null;
  selectedTaskId: string | null;
  taskDetailId: string | null;
  agentProfileId: string | null;
  docsCurrentPath: string | null;
  setActiveTab: (tab: AdminTab) => void;
  toggleSidebar: () => void;
  openTaskForm: (prefilledAgent?: string) => void;
  closeTaskForm: () => void;
  selectTask: (id: string | null) => void;
  openTaskDetail: (id: string) => void;
  closeTaskDetail: () => void;
  openAgentProfile: (id: string) => void;
  closeAgentProfile: () => void;
  setDocsPath: (path: string | null) => void;
}

export const useUiStore = create<UiState>((set) => ({
  activeTab: "office" as AdminTab,
  sidebarOpen: true,
  taskFormOpen: false,
  taskFormPrefilledAgent: null,
  selectedTaskId: null,
  taskDetailId: null,
  agentProfileId: null,
  docsCurrentPath: null,

  setActiveTab: (tab) => set({ activeTab: tab }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  openTaskForm: (prefilledAgent) => set({ taskFormOpen: true, taskFormPrefilledAgent: prefilledAgent || null }),
  closeTaskForm: () => set({ taskFormOpen: false, taskFormPrefilledAgent: null }),
  selectTask: (id) => set({ selectedTaskId: id }),
  openTaskDetail: (id) => set({ taskDetailId: id }),
  closeTaskDetail: () => set({ taskDetailId: null }),
  openAgentProfile: (id) => set({ agentProfileId: id }),
  closeAgentProfile: () => set({ agentProfileId: null }),
  setDocsPath: (path) => set({ docsCurrentPath: path }),
}));
