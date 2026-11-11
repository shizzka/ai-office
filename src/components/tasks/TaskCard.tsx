"use client";

import { DragEvent, useEffect, useState } from "react";
import { useAgentsStore } from "@/stores/agentsStore";
import { useTasksStore } from "@/stores/tasksStore";
import { useUiStore } from "@/stores/uiStore";
import type { Task } from "@/lib/utils/types";

const priorityColors: Record<string, string> = {
  low: "border-l-blue-400",
  medium: "border-l-yellow-400",
  high: "border-l-orange-400",
  urgent: "border-l-red-500",
};

const priorityLabels: Record<string, string> = {
  low: "Low",
  medium: "Med",
  high: "High",
  urgent: "Urgent",
};

const priorityBgColors: Record<string, string> = {
  low: "bg-blue-400/10 text-blue-400",
  medium: "bg-yellow-400/10 text-yellow-400",
  high: "bg-orange-400/10 text-orange-400",
  urgent: "bg-red-500/10 text-red-500",
};

interface TaskCardProps {
  task: Task;
  projectName?: string;
  onDragStart: (e: DragEvent) => void;
}

export function TaskCard({ task, projectName, onDragStart }: TaskCardProps) {
  const { agents } = useAgentsStore();
  const { deleteTask } = useTasksStore();
  const { openTaskDetail } = useUiStore();
  const assignedAgent = agents.find((a) => a.id === task.assignedTo);
  const priority = task.priority || "medium";
  const [lastLog, setLastLog] = useState<string | null>(null);

  useEffect(() => {
    if (task.status === "in_progress" || task.status === "review") {
      fetch(`/api/tasks/${task.id}/logs`).then(r => r.ok ? r.json() : { logs: [] }).then(d => {
        const logs = d.logs || [];
        if (logs.length > 0) setLastLog(logs[logs.length - 1].message);
      }).catch(() => {});
    }
  }, [task.id, task.status]);

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={() => openTaskDetail(task.id)}
      className={`bg-[#1e1e2a] rounded-lg p-3 border border-[#2a2a3a] border-l-[3px] cursor-pointer hover:border-[#ecb00a]/30 hover:bg-[#252535] transition-all group ${priorityColors[priority]}`}
    >
      {/* Title */}
      <div className="font-medium text-sm mb-2 leading-snug">
        {task.title}
      </div>

      {/* Description */}
      {task.description && (
        <div className="text-xs text-[#9ba1b5] mb-2 line-clamp-2">
          {task.description}
        </div>
      )}

      {/* Last log / status line */}
      {lastLog && (
        <div className="text-[10px] text-[#6b7280] mb-2 line-clamp-1 italic">
          {lastLog.slice(0, 80)}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Priority Badge */}
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${priorityBgColors[priority]}`}
          >
            {priorityLabels[priority]}
          </span>

          {/* Project Badge */}
          {task.projectId && (
            <span title={projectName || task.projectId} className="text-[10px] px-1.5 py-0.5 rounded bg-[#ecb00a]/10 text-[#ecb00a] font-medium max-w-[80px] truncate">
              {projectName || task.projectId}
            </span>
          )}

          {/* Assigned Agent */}
          {assignedAgent && (
            <span className="text-xs text-[#9ba1b5] flex items-center gap-1">
              <span>{assignedAgent.emoji}</span>
              <span className="max-w-[60px] truncate">
                {assignedAgent.name}
              </span>
            </span>
          )}
        </div>

        {/* Delete button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (confirm("Delete this task?")) {
              deleteTask(task.id);
            }
          }}
          className="opacity-0 group-hover:opacity-100 text-[#9ba1b5] hover:text-red-400 text-xs transition-all"
          title="Delete task"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
