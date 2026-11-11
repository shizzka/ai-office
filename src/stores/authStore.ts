"use client";

import { create } from "zustand";

interface User {
  id: string;
  username: string;
  role: "admin" | "viewer";
}

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: typeof window !== "undefined" ? localStorage.getItem("ai-office-token") : null,
  isLoading: true,

  login: async (username: string, password: string) => {
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (!res.ok) return false;

      const data = await res.json();
      localStorage.setItem("ai-office-token", data.token);
      // Token is now set as httpOnly cookie by the server
      set({ user: data.user, token: data.token });
      return true;
    } catch {
      return false;
    }
  },

  logout: () => {
    const token = get().token;
    if (token) {
      fetch("/api/auth/logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    }
    localStorage.removeItem("ai-office-token");
    // Cookie cleared by server on logout
    set({ user: null, token: null });
  },

  checkAuth: async () => {
    const token = get().token;

    try {
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch("/api/auth/me", { headers });

      if (res.ok) {
        const data = await res.json();
        set({ user: data.user, isLoading: false });
      } else {
        localStorage.removeItem("ai-office-token");
        set({ user: null, token: null, isLoading: false });
      }
    } catch {
      set({ isLoading: false });
    }
  },
}));
