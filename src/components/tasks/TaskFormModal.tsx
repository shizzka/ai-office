"use client";

import { useState, useEffect, FormEvent } from "react";
import { useTasksStore } from "@/stores/tasksStore";
import { useAgentsStore } from "@/stores/agentsStore";
import { useUiStore } from "@/stores/uiStore";

export function TaskFormModal() {
  const { createTask } = useTasksStore();
  const { agents } = useAgentsStore();
  const { closeTaskForm, taskFormPrefilledAgent } = useUiStore();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignedTo, setAssignedTo] = useState(taskFormPrefilledAgent || "");
  const [priority, setPriority] = useState("medium");
  const [projectId, setProjectId] = useState("");
  const [projects, setProjects] = useState<{id: string; name: string}[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/projects").then(r => r.ok ? r.json() : { projects: [] }).then(d => setProjects(d.projects || []));
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setLoading(true);

    const success = await createTask({
      title: title.trim(),
      description: description.trim() || undefined,
      assignedTo: assignedTo || undefined,
      projectId: projectId || undefined,
      priority,
    });

    // Auto-dispatch to agent if assigned
    if (success && assignedTo) {
      try {
        const tasks = useTasksStore.getState().tasks;
        const newTask = tasks.find((t) => t.title === title.trim() && t.assignedTo === assignedTo);
        if (newTask) {
          const token = localStorage.getItem("ai-office-token");
          await fetch(`/api/tasks/${newTask.id}/dispatch`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
          });
        }
      } catch { /* dispatch is best-effort */ }
    }

    setLoading(false);
    if (success) {
      closeTaskForm();
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-[#1a1d27] rounded-xl border border-[#363a4a] w-full max-w-md mx-4 shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#363a4a]">
          <h3 className="font-semibold text-lg">Новая задача</h3>
          <button
            onClick={closeTaskForm}
            className="text-[#9ba1b5] hover:text-white transition-colors text-xl leading-none"
          >
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm text-[#9ba1b5] mb-1.5">
              Заголовок *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2.5 bg-[#252836] border border-[#363a4a] rounded-lg text-[#e4e6f0] text-sm focus:outline-none focus:border-[#ecb00a]/50 transition-colors"
              placeholder="Заголовок задачи..."
              required
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm text-[#9ba1b5] mb-1.5">
              Описание
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2.5 bg-[#252836] border border-[#363a4a] rounded-lg text-[#e4e6f0] text-sm focus:outline-none focus:border-[#ecb00a]/50 transition-colors resize-none"
              placeholder="Описание задачи..."
              rows={3}
            />
          </div>

          <div>
            <label className="block text-sm text-[#9ba1b5] mb-1.5">
              Проект
            </label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="w-full px-3 py-2.5 bg-[#252836] border border-[#363a4a] rounded-lg text-[#e4e6f0] text-sm focus:outline-none focus:border-[#ecb00a]/50 transition-colors"
            >
              <option value="">Без проекта</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-sm text-[#9ba1b5] mb-1.5">
                Агент
              </label>
              <select
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                className="w-full px-3 py-2.5 bg-[#252836] border border-[#363a4a] rounded-lg text-[#e4e6f0] text-sm focus:outline-none focus:border-[#ecb00a]/50 transition-colors"
              >
                <option value="">Не назначен</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.emoji} {a.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex-1">
              <label className="block text-sm text-[#9ba1b5] mb-1.5">
                Приоритет
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full px-3 py-2.5 bg-[#252836] border border-[#363a4a] rounded-lg text-[#e4e6f0] text-sm focus:outline-none focus:border-[#ecb00a]/50 transition-colors"
              >
                <option value="low">Низкий</option>
                <option value="medium">Средний</option>
                <option value="high">Высокий</option>
                <option value="urgent">Срочный</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={closeTaskForm}
              className="px-4 py-2 text-sm text-[#9ba1b5] hover:text-white transition-colors"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={loading || !title.trim()}
              className="px-6 py-2 bg-[#ecb00a] hover:bg-[#d4a00a] text-[#0a0a12] rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Создаём..." : "Создать"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
