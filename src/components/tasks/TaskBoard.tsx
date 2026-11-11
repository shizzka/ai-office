"use client";

import { useState, useEffect, DragEvent } from "react";
import { useTasksStore } from "@/stores/tasksStore";
import { useAgentsStore } from "@/stores/agentsStore";
import { TaskCard } from "./TaskCard";
import { useUiStore } from "@/stores/uiStore";

const COLUMNS = [
  { id: "todo", label: "TODO", color: "#9ba1b5" },
  { id: "pending", label: "ОЖИДАНИЕ", color: "#a29bfe" },
  { id: "assigned", label: "НАЗНАЧЕНО", color: "#e17055" },
  { id: "in_progress", label: "В РАБОТЕ", color: "#0984e3" },
  { id: "review", label: "ПРОВЕРКА", color: "#fdcb6e" },
  { id: "done", label: "ГОТОВО", color: "#00b894" },
] as const;

export function TaskBoard() {
  const { tasks, moveTask } = useTasksStore();
  const { agents } = useAgentsStore();
  const { openTaskForm } = useUiStore();
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const [filterAgent, setFilterAgent] = useState<string>("");
  const [filterProject, setFilterProject] = useState<string>("");
  const [projects, setProjects] = useState<{id: string; name: string; status: string}[]>([]);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const { deleteTasks } = useTasksStore();

  useEffect(() => {
    fetch("/api/projects").then(r => r.ok ? r.json() : { projects: [] }).then(d =>
      setProjects((d.projects || []).filter((p: {status: string}) => p.status !== "archived"))
    );
  }, []);

  const filteredTasks = tasks.filter((t) => {
    if (filterAgent && t.assignedTo !== filterAgent) return false;
    if (filterProject && t.projectId !== filterProject) return false;
    return true;
  });

  function handleDragStart(e: DragEvent, taskId: string) {
    e.dataTransfer.setData("taskId", taskId);
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDragOver(e: DragEvent, columnId: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverColumn(columnId);
  }

  function handleDragLeave() {
    setDragOverColumn(null);
  }

  async function handleDrop(e: DragEvent, columnId: string) {
    e.preventDefault();
    setDragOverColumn(null);
    const taskId = e.dataTransfer.getData("taskId");
    if (taskId) {
      await moveTask(taskId, columnId);
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Board Header */}
      <div className="px-6 py-2.5 border-b border-[#2a2a2a] flex items-center justify-between bg-[#0f0f0f]/50 shrink-0">
        <h2 className="text-xs font-semibold tracking-widest text-[#555] uppercase">
          Задачи
        </h2>
        <div className="flex items-center gap-3">
          <select
            value={filterProject}
            onChange={(e) => setFilterProject(e.target.value)}
            className="text-[10px] bg-[#111118] border border-[#2a2a2a] rounded px-2 py-1.5 text-[#9ca3af] focus:outline-none focus:border-[#ecb00a]/30"
          >
            <option value="">Все проекты</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select
            value={filterAgent}
            onChange={(e) => setFilterAgent(e.target.value)}
            className="text-[10px] bg-[#111118] border border-[#2a2a2a] rounded px-2 py-1.5 text-[#9ca3af] focus:outline-none focus:border-[#ecb00a]/30"
          >
            <option value="">Все агенты</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.emoji} {a.name}
              </option>
            ))}
          </select>
          <button
            onClick={() => {
              if (selectMode) {
                setSelectMode(false);
                setSelected(new Set());
              } else {
                setSelectMode(true);
              }
            }}
            className={`text-[10px] px-3 py-1.5 rounded font-semibold transition-colors ${
              selectMode
                ? "bg-red-500/20 text-red-400 border border-red-500/30"
                : "bg-[#252836] text-[#9ba1b5] hover:text-[#ecb00a]"
            }`}
          >
            {selectMode ? `✕ Отмена (${selected.size})` : "☑ Выбрать"}
          </button>
          {selectMode && selected.size > 0 && (
            <button
              onClick={async () => {
                if (!confirm(`Удалить ${selected.size} задач?`)) return;
                setDeleting(true);
                await deleteTasks([...selected]);
                setSelected(new Set());
                setSelectMode(false);
                setDeleting(false);
              }}
              disabled={deleting}
              className="text-[10px] bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded font-semibold transition-colors disabled:opacity-50"
            >
              {deleting ? "Удаление..." : `🗑 Удалить (${selected.size})`}
            </button>
          )}
          <button
            onClick={() => openTaskForm()}
            className="text-[10px] bg-[#ecb00a] hover:bg-[#d4a00a] text-[#0a0a12] px-3 py-1.5 rounded font-semibold transition-colors"
          >
            + Задача
          </button>
        </div>
      </div>

      {/* Columns */}
      <div className="flex-1 flex gap-4 p-4 overflow-x-auto">
        {COLUMNS.map((column) => {
          const columnTasks = filteredTasks.filter(
            (t) => t.status === column.id
          );
          const isDragOver = dragOverColumn === column.id;

          // Limit done column to 10 most recent
          const displayTasks = column.id === "done" ? columnTasks.slice(0, 10) : columnTasks;
          const hiddenCount = columnTasks.length - displayTasks.length;

          return (
            <div
              key={column.id}
              className={`flex-1 min-w-[260px] flex flex-col rounded-xl transition-colors ${
                isDragOver
                  ? "bg-[#ecb00a]/5 ring-1 ring-[#ecb00a]/20"
                  : "bg-[#16161f]"
              }`}
              onDragOver={(e) => handleDragOver(e, column.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, column.id)}
            >
              {/* Column Header */}
              <div className="px-3 py-3 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <div
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: column.color }}
                  />
                  <span className="text-xs font-semibold tracking-wider text-[#9ba1b5]">
                    {column.label}
                  </span>
                </div>
                <span className="text-xs text-[#9ba1b5] bg-[#252836] px-2 py-0.5 rounded-full">
                  {columnTasks.length}
                </span>
              </div>

              {/* Tasks */}
              <div className="flex-1 px-2 pb-2 space-y-2 overflow-y-auto">
                {displayTasks.map((task) => (
                  <div key={task.id} className="flex items-start gap-1">
                    {selectMode && (
                      <input
                        type="checkbox"
                        checked={selected.has(task.id)}
                        onChange={() => {
                          setSelected((prev) => {
                            const next = new Set(prev);
                            if (next.has(task.id)) next.delete(task.id);
                            else next.add(task.id);
                            return next;
                          });
                        }}
                        className="mt-3 ml-1 accent-[#ecb00a] shrink-0"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <TaskCard
                        task={task}
                        projectName={projects.find((project) => project.id === task.projectId)?.name}
                        onDragStart={(e) => handleDragStart(e, task.id)}
                      />
                    </div>
                  </div>
                ))}
                {hiddenCount > 0 && (
                  <div className="text-center py-2 text-[10px] text-[#555]">
                    ещё {hiddenCount} задач
                  </div>
                )}
                {columnTasks.length === 0 && (
                  <div className="text-center py-8 text-xs text-[#9ba1b5]">
                    {isDragOver ? "Перетащи сюда" : "Нет задач"}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
