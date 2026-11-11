"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/authStore";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuthStore();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const success = await login(username, password);
    setLoading(false);

    if (success) {
      router.push("/office/admin");
    } else {
      setError("Неверный логин или пароль");
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-[#0a0a12] relative overflow-hidden">
      {/* Background grid */}
      <div className="absolute inset-0 opacity-5"
        style={{
          backgroundImage: "linear-gradient(rgba(236,176,10,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(236,176,10,0.3) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      {/* Ambient glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#ecb00a]/5 rounded-full blur-[120px]" />

      <div className="w-full max-w-sm p-6 relative z-10">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="text-4xl mb-4">📁</div>
          <h1 className="text-xl font-bold tracking-wider text-white">
            OpenClaw <span className="text-[#ecb00a]">Content Factory</span>
          </h1>
          <p className="text-[#555] mt-2 text-xs tracking-widest uppercase">
            Mission Control
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-3 bg-[#111118] border border-[#1a1a2e] rounded-lg text-[#e4e6f0] text-sm focus:outline-none focus:border-[#ecb00a]/50 transition-colors placeholder-[#333]"
              placeholder="Логин"
              required
              autoComplete="username"
            />
          </div>

          <div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 bg-[#111118] border border-[#1a1a2e] rounded-lg text-[#e4e6f0] text-sm focus:outline-none focus:border-[#ecb00a]/50 transition-colors placeholder-[#333]"
              placeholder="Пароль"
              required
              autoComplete="current-password"
            />
          </div>

          {error && (
            <div className="p-3 bg-red-500/5 border border-red-500/20 rounded-lg text-red-400/80 text-xs text-center">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-[#ecb00a] hover:bg-[#d4a00a] text-[#0a0a12] rounded-lg font-semibold text-sm tracking-wide transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "..." : "Войти"}
          </button>
        </form>

        <div className="mt-8 text-center text-[10px] text-[#333]">
          OpenClaw Factory • {new Date().getFullYear()}
        </div>
      </div>
    </div>
  );
}
