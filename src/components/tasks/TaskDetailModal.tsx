"use client";

import { useState, useEffect, useRef, FormEvent } from "react";
import { useTasksStore } from "@/stores/tasksStore";
import { useAgentsStore } from "@/stores/agentsStore";
import { useUiStore } from "@/stores/uiStore";
import { getMCWebSocket } from "@/lib/ws";
import type { TaskLog } from "@/lib/utils/types";

const priorityOptions = [
  { value: "low", label: "Низкий", color: "text-blue-400" },
  { value: "medium", label: "Средний", color: "text-yellow-400" },
  { value: "high", label: "Высокий", color: "text-orange-400" },
  { value: "urgent", label: "Срочный", color: "text-red-500" },
];

const statusOptions = [
  { value: "planning", label: "Планирование" },
  { value: "todo", label: "К выполнению" },
  { value: "assigned", label: "Назначено" },
  { value: "in_progress", label: "В работе" },
  { value: "review", label: "На проверке" },
  { value: "done", label: "Готово" },
];

export function TaskDetailModal() {
  const { taskDetailId, closeTaskDetail } = useUiStore();
  const { tasks, updateTask } = useTasksStore();
  const { agents } = useAgentsStore();

  const task = tasks.find((t) => t.id === taskDetailId);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");
  const [status, setStatus] = useState("todo");
  const [assignedTo, setAssignedTo] = useState("");
  const [logs, setLogs] = useState<TaskLog[]>([]);
  const [newLogMessage, setNewLogMessage] = useState("");
  const [newLogAgent, setNewLogAgent] = useState("");
  const [saving, setSaving] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const [dispatchResult, setDispatchResult] = useState<string | null>(null);

  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description || "");
      setPriority(task.priority || "medium");
      setStatus(task.status || "todo");
      setAssignedTo(task.assignedTo || "");
      fetchLogs(task.id);

      // Live updates via WebSocket
      const ws = getMCWebSocket();
      const unsub1 = ws.on("task:comment", (event: any) => {
        if (event.taskId === task.id) fetchLogs(task.id);
      });
      const unsub2 = ws.on("logs:update", () => {
        fetchLogs(task.id);
      });
      return () => { unsub1(); unsub2(); };
    }
  }, [task?.id]);

  async function fetchLogs(taskId: string) {
    try {
      const res = await fetch(`/api/tasks/${taskId}/logs`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
        // Auto-scroll to bottom
        setTimeout(() => logsEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
      }
    } catch { /* skip */ }
  }

  async function handleSave() {
    if (!task) return;
    setSaving(true);
    await updateTask(task.id, {
      title: title.trim(),
      description: description.trim() || null,
      priority: priority as "low" | "medium" | "high" | "urgent",
      status: status as "todo" | "in_progress" | "review" | "done",
      assignedTo: assignedTo || null,
    });
    setSaving(false);
  }

  async function handleAddLog(e: FormEvent) {
    e.preventDefault();
    if (!task || !newLogMessage.trim()) return;
    const token = typeof window !== "undefined" ? localStorage.getItem("ai-office-token") : null;
    if (!token) return;
    try {
      const res = await fetch(`/api/tasks/${task.id}/logs`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ agentId: newLogAgent || undefined, message: newLogMessage.trim() }),
      });
      if (res.ok) {
        setNewLogMessage("");
        fetchLogs(task.id);
      }
    } catch { /* skip */ }
  }

  if (!taskDetailId || !task) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={closeTaskDetail}>
      <div
        className="bg-[#1a1d27] rounded-xl border border-[#363a4a] w-full max-w-4xl mx-4 shadow-2xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#363a4a] shrink-0">
          <h3 className="font-semibold text-lg">Детали задачи</h3>
          <button onClick={closeTaskDetail} className="text-[#9ba1b5] hover:text-white text-xl">&times;</button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-xs text-[#9ba1b5] mb-1">Заголовок</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 bg-[#252836] border border-[#363a4a] rounded-lg text-sm text-[#e4e6f0] focus:outline-none focus:border-[#ecb00a]/50"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs text-[#9ba1b5] mb-1">Описание</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 bg-[#252836] border border-[#363a4a] rounded-lg text-sm text-[#e4e6f0] focus:outline-none focus:border-[#ecb00a]/50 resize-none"
            />
          </div>

          {/* Row: Status, Priority, Agent */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs text-[#9ba1b5] mb-1">Статус</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full px-3 py-2 bg-[#252836] border border-[#363a4a] rounded-lg text-sm text-[#e4e6f0] focus:outline-none focus:border-[#ecb00a]/50"
              >
                {statusOptions.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-xs text-[#9ba1b5] mb-1">Приоритет</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full px-3 py-2 bg-[#252836] border border-[#363a4a] rounded-lg text-sm text-[#e4e6f0] focus:outline-none focus:border-[#ecb00a]/50"
              >
                {priorityOptions.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-xs text-[#9ba1b5] mb-1">Агент</label>
              <select
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                className="w-full px-3 py-2 bg-[#252836] border border-[#363a4a] rounded-lg text-sm text-[#e4e6f0] focus:outline-none focus:border-[#ecb00a]/50"
              >
                <option value="">Не назначен</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>{a.emoji} {a.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex justify-between items-center">
            <div>
              {assignedTo && (
                <button
                  onClick={async () => {
                    if (!task) return;
                    setDispatching(true);
                    setDispatchResult(null);
                    try {
                      // Save first
                      await handleSave();
                      const token = localStorage.getItem("ai-office-token");
                      const res = await fetch(`/api/tasks/${task.id}/dispatch`, {
                        method: "POST",
                        headers: {
                          "Content-Type": "application/json",
                          ...(token ? { Authorization: `Bearer ${token}` } : {}),
                        },
                      });
                      const data = await res.json();
                      if (data.ok) {
                        setDispatchResult(`✅ Отправлено ${data.agentName}`);
                        setStatus("in_progress");
                        fetchLogs(task.id);
                      } else {
                        setDispatchResult(`❌ ${data.error}`);
                      }
                    } catch (err) {
                      setDispatchResult(`❌ ${String(err)}`);
                    } finally {
                      setDispatching(false);
                    }
                  }}
                  disabled={dispatching}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
                >
                  {dispatching ? "Отправка..." : "🚀 Отправить агенту"}
                </button>
              )}
              {dispatchResult && (
                <span className="text-xs text-[#9ba1b5] ml-3">{dispatchResult}</span>
              )}
            </div>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-5 py-2 bg-[#ecb00a] hover:bg-[#d4a00a] text-[#0a0a12] rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
            >
              {saving ? "Сохранение..." : "Сохранить"}
            </button>
          </div>

          {/* Chat / Timeline */}
          <div className="border-t border-[#363a4a] pt-4 flex flex-col flex-1 min-h-0">
            <h4 className="text-sm font-semibold text-[#9ba1b5] mb-3">💬 Рабочий чат</h4>

            {logs.length === 0 && (
              <div className="text-xs text-[#555] py-8 text-center">Начните работу — напишите сообщение агенту</div>
            )}

            <div className="space-y-2 overflow-y-auto flex-1 max-h-64 mb-3">
              {logs.map((log) => {
                const isUser = (log as { authorType?: string }).authorType === "user";
                const agent = agents.find((a) => a.id === log.agentId);
                return (
                  <div key={log.id} className={`flex gap-3 items-start rounded-lg p-3 ${isUser ? "bg-[#1e3a5f]" : "bg-[#252836]"}`}>
                    <span className="text-base shrink-0">{isUser ? "👤" : agent?.emoji || "⚙️"}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-[#e4e6f0] whitespace-pre-wrap">{log.message}</div>
                      <div className="text-[10px] text-[#555] mt-1">
                        {isUser ? "Макс" : agent?.name || "Система"} • {log.createdAt ? new Date(log.createdAt).toLocaleString("ru-RU") : ""}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={logsEndRef} />
            </div>

            {/* Chat input */}
            <form onSubmit={async (e) => {
              e.preventDefault();
              if (!task || !newLogMessage.trim()) return;
              const token = typeof window !== "undefined" ? localStorage.getItem("ai-office-token") : null;
              try {
                const res = await fetch(`/api/tasks/${task.id}/chat`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                  body: JSON.stringify({ message: newLogMessage.trim() }),
                });
                if (res.ok) {
                  setNewLogMessage("");
                  // Broadcast via WS
                  getMCWebSocket().send({ type: "task:sendMessage", taskId: task.id, message: newLogMessage.trim() });
                  fetchLogs(task.id);
                }
              } catch { /* skip */ }
            }} className="flex gap-2">
              <input
                value={newLogMessage}
                onChange={(e) => setNewLogMessage(e.target.value)}
                placeholder={assignedTo ? `Написать ${agents.find(a => a.id === assignedTo)?.name || 'агенту'}...` : "Назначьте агента для чата"}
                disabled={!assignedTo}
                className="flex-1 px-3 py-2 bg-[#252836] border border-[#363a4a] rounded-lg text-sm text-[#e4e6f0] focus:outline-none focus:border-[#ecb00a]/50 disabled:opacity-40"
              />
              <button
                type="submit"
                disabled={!assignedTo || !newLogMessage.trim()}
                className="px-4 py-2 bg-[#ecb00a] text-[#0a0a12] rounded-lg text-sm font-semibold hover:bg-[#d4a00a] disabled:opacity-40"
              >
                Отправить
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
