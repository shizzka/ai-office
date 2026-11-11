export type AgentStatus = "idle" | "working" | "thinking" | "busy" | "offline";
export type TaskStatus = "todo" | "pending" | "assigned" | "in_progress" | "review" | "done";
export type TaskPriority = "low" | "medium" | "high" | "urgent";
export type ProjectStatus = "active" | "paused" | "completed";
export type UserRole = "admin" | "viewer";

export interface Agent {
  id: string;
  name: string;
  emoji: string;
  role: string;
  description: string | null;
  statusText?: string | null;
  archived?: boolean;
  positionX: number | null;
  positionY: number | null;
  currentStatus: AgentStatus | null;
  contextPct: number;
  createdAt: string | null;
}

export interface Task {
  statusDetail?: string | null;
  archived?: boolean;
  id: string;
  projectId: string | null;
  title: string;
  description: string | null;
  status: TaskStatus | null;
  priority: TaskPriority | null;
  assignedTo: string | null;
  createdBy: string | null;
  estimatedHours: number | null;
  actualHours: number | null;
  dueDate: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface Project {
  archived?: boolean;
  id: string;
  name: string;
  description: string | null;
  status: ProjectStatus | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface TaskLog {
  id: string;
  taskId: string;
  agentId: string | null;
  message: string;
  createdAt: string | null;
}

export interface ActivityLog {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  details: string | null;
  userId: string | null;
  createdAt: string | null;
}
