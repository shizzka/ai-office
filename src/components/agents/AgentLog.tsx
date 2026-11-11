"use client";

import { useState, useEffect, useRef } from "react";

interface LogMessage {
  role: "user" | "assistant" | "system" | "tool";
  text: string;
  timestamp: string;
  toolName?: string;
}

interface SessionInfo {
  index: number;
  id: string;
  modified: string;
}

interface Props {
  agentId: string;
  agentName: string;
  agentEmoji: string;
  onClose: () => void;
}

export function AgentLog({ agentId, agentName, agentEmoji, onClose }: Props) {
  const [messages, setMessages] = useState<LogMessage[]>([]);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [selectedSession, setSelectedSession] = useState(0);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [showTools, setShowTools] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchLog = () => {
    setLoading(true);
    const token = localStorage.getItem("ai-office-token");
    fetch(`/api/agents/${agentId}/log?limit=100&session=${selectedSession}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => r.json())
      .then((data) => {
        setMessages(data.messages || []);
        setSessions(data.sessions || []);
        setTotal(data.total || 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchLog();
  }, [agentId, selectedSession]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const filtered = showTools ? messages : messages.filter((m) => m.role !== "tool");

  function formatTime(ts: string) {
    if (!ts) return "";
    try {
      const d = new Date(ts);
      return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" });
    } catch {
      return "";
    }
  }

  function formatDate(ts: string) {
    if (!ts) return "";
    try {
      return new Date(ts).toLocaleDateString("ru-RU", { day: "numeric", month: "short", timeZone: "Europe/Moscow" });
    } catch {
      return "";
    }
  }

  return (
    <div className="flex flex-col h-full bg-[#0f0f0f]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#2a2a2a]">
        <div className="flex items-center gap-2">
          <span className="text-lg">{agentEmoji}</span>
          <span className="text-sm font-semibold text-[#e4e6f0]">{agentName}</span>
          <span className="text-[10px] text-[#555]">({total} сообщений)</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowTools(!showTools)}
            className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
              showTools
                ? "border-[#ecb00a]/50 text-[#ecb00a] bg-[#ecb00a]/10"
                : "border-[#363a4a] text-[#555] hover:text-[#9ba1b5]"
            }`}
          >
            🔧 Tools
          </button>
          <button onClick={onClose} className="text-[#555] hover:text-[#e4e6f0] text-sm">✕</button>
        </div>
      </div>

      {/* Session selector */}
      {sessions.length > 1 && (
        <div className="flex gap-1 px-4 py-2 border-b border-[#1a1a2e] overflow-x-auto">
          {sessions.slice(0, 10).map((s) => (
            <button
              key={s.index}
              onClick={() => setSelectedSession(s.index)}
              className={`text-[10px] px-2 py-0.5 rounded whitespace-nowrap transition-colors ${
                selectedSession === s.index
                  ? "bg-[#ecb00a]/15 text-[#ecb00a] border border-[#ecb00a]/30"
                  : "text-[#555] hover:text-[#9ba1b5] border border-[#2a2a2a]"
              }`}
            >
              {formatDate(s.modified)}
            </button>
          ))}
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {loading ? (
          <div className="text-center text-xs text-[#555] py-8">Загрузка лога...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center text-xs text-[#555] py-8">Нет сообщений</div>
        ) : (
          filtered.map((msg, i) => (
            <div key={i} className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}>
              {msg.role === "tool" ? (
                <div className="flex items-center gap-1 text-[10px] text-[#555] font-mono py-0.5">
                  <span>⚙️</span>
                  <span>{msg.text}</span>
                  <span className="text-[#333]">{formatTime(msg.timestamp)}</span>
                </div>
              ) : (
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-xs leading-relaxed ${
                    msg.role === "user"
                      ? "bg-[#ecb00a]/15 text-[#e4e6f0]"
                      : "bg-[#1a1a2e] text-[#c8cad0]"
                  }`}
                >
                  <div className="whitespace-pre-wrap break-words">{msg.text}</div>
                  <div className={`text-[9px] mt-1 ${msg.role === "user" ? "text-[#ecb00a]/40" : "text-[#444]"}`}>
                    {formatTime(msg.timestamp)}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
      {/* Chat input */}
      <div className="border-t border-[#2a2a2a] px-4 py-3">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!chatInput.trim() || sending) return;
            setSending(true);
            setSendError(null);
            try {
              const token = localStorage.getItem("ai-office-token");
              const res = await fetch(`/api/agents/${agentId}/send`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({ message: chatInput.trim() }),
              });
              const data = await res.json();
              if (data.ok) {
                setChatInput("");
                // Refresh log after short delay
                setTimeout(() => {
                  setSelectedSession(0);
                  fetchLog();
                }, 2000);
              } else {
                setSendError(data.error || "Ошибка отправки");
              }
            } catch (err) {
              setSendError(String(err));
            } finally {
              setSending(false);
            }
          }}
          className="flex gap-2"
        >
          <input
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder={`Написать ${agentName}...`}
            className="flex-1 px-3 py-2 bg-[#16161f] border border-[#363a4a] rounded-lg text-xs text-[#e4e6f0] focus:outline-none focus:border-[#ecb00a]/50 placeholder:text-[#555]"
          />
          <button
            type="submit"
            disabled={sending || !chatInput.trim()}
            className="px-4 py-2 bg-[#ecb00a] hover:bg-[#d4a00a] text-[#0a0a12] rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
          >
            {sending ? "⏳" : "→"}
          </button>
        </form>
        {sendError && <div className="text-[10px] text-red-400 mt-1">{sendError}</div>}
      </div>
    </div>
  );
}
