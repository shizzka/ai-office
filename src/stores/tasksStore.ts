"use client";

import { create } from "zustand";
import type { Task } from "@/lib/utils/types";
import { getMCWebSocket } from "@/lib/ws";

interface TasksState {
  tasks: Task[];
  isLoading: boolean;
  wsConnected: boolean;
  initWS: () => void;
  fetchTasks: () => Promise<void>;
  createTask: (data: {
    title: string;
    description?: string;
    assignedTo?: string;
    projectId?: string;
    priority?: string;
  }) => Promise<boolean>;
  updateTask: (id: string, data: Partial<Task>) => Promise<boolean>;
  deleteTask: (id: string) => Promise<boolean>;
  deleteTasks: (ids: string[]) => Promise<boolean>;
  moveTask: (id: string, newStatus: string) => Promise<boolean>;
}

function authHeaders(): Record<string, string> {
  const token = typeof window !== "undefined" ? localStorage.getItem("ai-office-token") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export const useTasksStore = create<TasksState>((set, get) => ({
  tasks: [],
  isLoading: false,
  wsConnected: false,

  initWS: () => {
    const ws = getMCWebSocket();
    ws.connect();
    ws.on("connected", () => set({ wsConnected: true }));
    ws.on("disconnected", () => set({ wsConnected: false }));
    // Refetch authoritative filtered data; worker payloads may use SQLite field names.
    ws.on("tasks:sync", () => { void get().fetchTasks(); });
    ws.on("tasks:refresh", () => { void get().fetchTasks(); });
    ws.on("init", () => { void get().fetchTasks(); });
  },

  fetchTasks: async () => {
    set({ isLoading: true });
    try {
      const res = await fetch("/api/tasks");
      if (res.ok) {
        const data = await res.json();
        set({ tasks: data.tasks, isLoading: false });
      } else {
        set({ isLoading: false });
      }
    } catch {
      set({ isLoading: false });
    }
  },

  createTask: async (data) => {
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const { task } = await res.json();
        set({ tasks: [task, ...get().tasks] });
        return true;
      }
      return false;
    } catch {
      return false;
    }
  },

  updateTask: async (id, data) => {
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const { task } = await res.json();
        set({
          tasks: get().tasks.map((t) => (t.id === id ? task : t)),
        });
        return true;
      }
      return false;
    } catch {
      return false;
    }
  },

  deleteTask: async (id) => {
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: "DELETE",
        headers: { ...authHeaders() },
      });
      if (res.ok) {
        set({ tasks: get().tasks.filter((t) => t.id !== id) });
        return true;
      }
      return false;
    } catch {
      return false;
    }
  },

  deleteTasks: async (ids) => {
    try {
      const results = await Promise.all(
        ids.map((id) =>
          fetch(`/api/tasks/${id}`, {
            method: "DELETE",
            headers: { ...authHeaders() },
          })
        )
      );
      const deletedIds = ids.filter((_, i) => results[i].ok);
      set({ tasks: get().tasks.filter((t) => !deletedIds.includes(t.id)) });
      return deletedIds.length === ids.length;
    } catch {
      return false;
    }
  },

  moveTask: async (id, newStatus) => {
    // Optimistic update
    const prevTasks = get().tasks;
    set({
      tasks: prevTasks.map((t) =>
        t.id === id ? { ...t, status: newStatus as Task["status"] } : t
      ),
    });

    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        set({ tasks: prevTasks });
        return false;
      }
      return true;
    } catch {
      set({ tasks: prevTasks });
      return false;
    }
  },
}));
