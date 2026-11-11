import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  username: text("username").unique().notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ["admin", "viewer"] }).notNull().default("viewer"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  lastSeenAt: text("last_seen_at"),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token: text("token").unique().notNull(),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});

export const agents = sqliteTable("agents", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  emoji: text("emoji").notNull(),
  role: text("role").notNull(),
  description: text("description"),
  archived: integer("archived", { mode: "boolean" }).notNull().default(false),
  positionX: integer("position_x").default(0),
  positionY: integer("position_y").default(0),
  currentStatus: text("current_status", {
    enum: ["idle", "working", "thinking", "busy", "offline"],
  }).default("idle"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});

export const agentStatusHistory = sqliteTable("agent_status_history", {
  id: text("id").primaryKey(),
  agentId: text("agent_id")
    .notNull()
    .references(() => agents.id, { onDelete: "cascade" }),
  status: text("status").notNull(),
  statusText: text("status_text"),
  startedAt: text("started_at").default(sql`CURRENT_TIMESTAMP`),
  endedAt: text("ended_at"),
});

export const projects = sqliteTable("projects", {
  archived: integer("archived", { mode: "boolean" }).notNull().default(false),
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  status: text("status", { enum: ["active", "paused", "completed"] }).default("active"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

export const tasks = sqliteTable("tasks", {
  statusDetail: text("status_detail"),
  archived: integer("archived", { mode: "boolean" }).notNull().default(false),
  id: text("id").primaryKey(),
  projectId: text("project_id").references(() => projects.id, {
    onDelete: "cascade",
  }),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status", {
    enum: ["planning", "todo", "pending", "assigned", "in_progress", "review", "done"],
  }).default("todo"),
  priority: text("priority", {
    enum: ["low", "medium", "high", "urgent"],
  }).default("medium"),
  assignedTo: text("assigned_to").references(() => agents.id, {
    onDelete: "set null",
  }),
  createdBy: text("created_by").references(() => users.id, {
    onDelete: "set null",
  }),
  estimatedHours: real("estimated_hours"),
  actualHours: real("actual_hours"),
  dueDate: text("due_date"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

export const activityLogs = sqliteTable("activity_logs", {
  archived: integer("archived", { mode: "boolean" }).notNull().default(false),
  id: text("id").primaryKey(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  action: text("action").notNull(),
  details: text("details"),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});

export const taskLogs = sqliteTable("task_logs", {
  id: text("id").primaryKey(),
  taskId: text("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: "cascade" }),
  agentId: text("agent_id").references(() => agents.id, { onDelete: "set null" }),
  message: text("message").notNull(),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});

export const taskComments = sqliteTable("task_comments", {
  id: text("id").primaryKey(),
  taskId: text("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: "cascade" }),
  authorType: text("author_type", { enum: ["user", "agent"] }).notNull(),
  authorId: text("author_id").notNull(),
  body: text("body").notNull(),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});

export const healthchecks = sqliteTable("healthchecks", {
  id: text("id").primaryKey(),
  name: text("name").unique().notNull(),
  endpoint: text("endpoint").notNull(),
  interval: text("interval").notNull().default("daily"),
  status: text("status", { enum: ["ok", "error", "unknown"] }).notNull().default("unknown"),
  okCount: integer("ok_count").notNull().default(0),
  errorCount: integer("error_count").notNull().default(0),
  lastErrorCode: text("last_error_code"),
  lastMessage: text("last_message"),
  lastRunAt: text("last_run_at"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

export const openclawEvents = sqliteTable("openclaw_events", {
  id: text("id").primaryKey(),
  eventType: text("event_type").notNull(),
  agentId: text("agent_id").references(() => agents.id, {
    onDelete: "cascade",
  }),
  payload: text("payload"),
  processed: integer("processed", { mode: "boolean" }).default(false),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});
