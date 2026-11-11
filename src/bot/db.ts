import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq, gt, inArray, like } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import * as schema from "../lib/db/schema";
import path from "path";
import fs from "fs";

const dbPath = path.resolve(process.cwd(), process.env.DATABASE_URL || "./data/database.sqlite");
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

const db = drizzle(sqlite, { schema });

export async function getAllAgents() {
  return db.select().from(schema.agents).all();
}

export async function getAgent(id: string) {
  const agent = db.select().from(schema.agents).where(eq(schema.agents.id, id)).get();
  if (!agent) return null;

  const lastStatus = db
    .select()
    .from(schema.agentStatusHistory)
    .where(eq(schema.agentStatusHistory.agentId, id))
    .all()
    .sort((a, b) => (b.startedAt ?? "").localeCompare(a.startedAt ?? ""))[0] ?? null;

  return { agent, lastStatus };
}

export async function updateAgentStatus(
  id: string,
  status: "idle" | "working" | "thinking" | "busy" | "offline"
) {
  const agent = db.select().from(schema.agents).where(eq(schema.agents.id, id)).get();
  if (!agent) return null;

  db.update(schema.agents)
    .set({ currentStatus: status })
    .where(eq(schema.agents.id, id))
    .run();

  const historyId = uuidv4();
  db.insert(schema.agentStatusHistory)
    .values({
      id: historyId,
      agentId: id,
      status,
      statusText: `Status set via Telegram bot`,
    })
    .run();

  const logId = uuidv4();
  db.insert(schema.activityLogs)
    .values({
      id: logId,
      entityType: "agent",
      entityId: id,
      action: "status_change",
      details: JSON.stringify({ from: agent.currentStatus, to: status, via: "telegram_bot" }),
    })
    .run();

  return agent;
}

export async function getActiveTasks() {
  const activeTasks = db
    .select()
    .from(schema.tasks)
    .where(inArray(schema.tasks.status, ["todo", "in_progress"]))
    .all();

  const result = await Promise.all(
    activeTasks.map(async (task) => {
      let agentName: string | null = null;
      if (task.assignedTo) {
        const agent = db
          .select({ name: schema.agents.name })
          .from(schema.agents)
          .where(eq(schema.agents.id, task.assignedTo))
          .get();
        agentName = agent?.name ?? null;
      }
      return { ...task, agentName };
    })
  );

  return result;
}

export async function getRecentFeed(limit = 10) {
  return db
    .select()
    .from(schema.activityLogs)
    .all()
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
    .slice(0, limit);
}

export async function getNewFeedSince(lastId: string | null): Promise<typeof schema.activityLogs.$inferSelect[]> {
  if (!lastId) {
    return db
      .select()
      .from(schema.activityLogs)
      .all()
      .sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""))
      .slice(-1);
  }

  // Get the createdAt of lastId to find newer records
  const allLogs = db
    .select()
    .from(schema.activityLogs)
    .all()
    .sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));

  const lastIndex = allLogs.findIndex((log) => log.id === lastId);
  if (lastIndex === -1) return [];

  return allLogs.slice(lastIndex + 1);
}

export async function createTask(agentId: string, title: string) {
  const agent = db.select().from(schema.agents).where(eq(schema.agents.id, agentId)).get();
  if (!agent) return null;

  const taskId = uuidv4();
  db.insert(schema.tasks)
    .values({
      id: taskId,
      title,
      assignedTo: agentId,
      status: "todo",
      priority: "medium",
    })
    .run();

  const logId = uuidv4();
  db.insert(schema.activityLogs)
    .values({
      id: logId,
      entityType: "agent",
      entityId: agentId,
      action: "task_created",
      details: JSON.stringify({ taskId, title, via: "telegram_bot" }),
    })
    .run();

  return { taskId, title, agentId };
}

export async function closeTask(taskId: string) {
  // Support both full UUID and short (8-char) prefix
  const task = taskId.length < 36
    ? db.select().from(schema.tasks).where(like(schema.tasks.id, `${taskId}%`)).get()
    : db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId)).get();
  if (!task) return null;

  db.update(schema.tasks)
    .set({ status: "done", updatedAt: new Date().toISOString() })
    .where(eq(schema.tasks.id, taskId))
    .run();

  if (task.assignedTo) {
    const logId = uuidv4();
    db.insert(schema.activityLogs)
      .values({
        id: logId,
        entityType: "agent",
        entityId: task.assignedTo,
        action: "task_done",
        details: JSON.stringify({ taskId, title: task.title, via: "telegram_bot" }),
      })
      .run();
  }

  return task;
}

export async function getAgentTasks(agentId: string) {
  const agent = db.select().from(schema.agents).where(eq(schema.agents.id, agentId)).get();
  if (!agent) return null;

  const tasks = db
    .select()
    .from(schema.tasks)
    .where(eq(schema.tasks.assignedTo, agentId))
    .all()
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));

  return { agent, tasks };
}

export async function setAgentDoing(agentId: string, statusText: string, status: "working" | "thinking" | "busy" | "idle") {
  const agent = db.select().from(schema.agents).where(eq(schema.agents.id, agentId)).get();
  if (!agent) return null;

  db.update(schema.agents)
    .set({ currentStatus: status })
    .where(eq(schema.agents.id, agentId))
    .run();

  const historyId = uuidv4();
  db.insert(schema.agentStatusHistory)
    .values({
      id: historyId,
      agentId,
      status,
      statusText,
    })
    .run();

  const logId = uuidv4();
  db.insert(schema.activityLogs)
    .values({
      id: logId,
      entityType: "agent",
      entityId: agentId,
      action: "status_changed",
      details: JSON.stringify({ status, statusText, via: "telegram_bot" }),
    })
    .run();

  return agent;
}

export async function getTokenStats() {
  const events = db
    .select()
    .from(schema.openclawEvents)
    .all();

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCost = 0;

  for (const event of events) {
    if (event.payload) {
      try {
        const payload = JSON.parse(event.payload);
        if (payload.input_tokens) totalInputTokens += payload.input_tokens;
        if (payload.output_tokens) totalOutputTokens += payload.output_tokens;
        if (payload.cost) totalCost += payload.cost;
      } catch {
        // ignore parse errors
      }
    }
  }

  return { totalInputTokens, totalOutputTokens, totalCost, eventCount: events.length };
}
