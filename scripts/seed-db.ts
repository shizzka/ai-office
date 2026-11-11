import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
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

// Run migrations first
const migrations = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  emoji TEXT NOT NULL,
  role TEXT NOT NULL,
  description TEXT,
  position_x INTEGER DEFAULT 0,
  position_y INTEGER DEFAULT 0,
  current_status TEXT DEFAULT 'idle',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS agent_status_history (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  status TEXT NOT NULL,
  status_text TEXT,
  started_at TEXT DEFAULT CURRENT_TIMESTAMP,
  ended_at TEXT,
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'active',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'todo',
  priority TEXT DEFAULT 'medium',
  assigned_to TEXT,
  created_by TEXT,
  estimated_hours REAL,
  actual_hours REAL,
  due_date TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_to) REFERENCES agents(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS task_logs (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  agent_id TEXT,
  message TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS activity_logs (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  details TEXT,
  user_id TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS openclaw_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  agent_id TEXT,
  payload TEXT,
  processed INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_agent_status_history_agent ON agent_status_history(agent_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_activity_logs_entity ON activity_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_openclaw_events_processed ON openclaw_events(processed);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON activity_logs(created_at);
`;

const migrationStatements = migrations
  .split(";")
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

for (const statement of migrationStatements) {
  sqlite.exec(statement);
}

console.log("Tables created.");

// Seed admin user
const adminId = uuidv4();
const adminPasswordHash = bcrypt.hashSync(process.env.ADMIN_PASSWORD || "admin123", 10);

const insertUser = sqlite.prepare(
  "INSERT OR REPLACE INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)"
);
insertUser.run(adminId, process.env.ADMIN_USERNAME || "admin", adminPasswordHash, "admin");

// Seed viewer user
const viewerId = uuidv4();
const viewerPasswordHash = bcrypt.hashSync("viewer123", 10);
insertUser.run(viewerId, "viewer", viewerPasswordHash, "viewer");

console.log("Users seeded.");

// Seed 6 agents
const agentsData = [
  {
    id: "vanya",
    name: "Ванечка",
    emoji: "🎯",
    role: "Координатор",
    description: "Главный координатор проектов. Планирует задачи, распределяет нагрузку, следит за дедлайнами.",
    positionX: 200,
    positionY: 120,
    currentStatus: "working",
  },
  {
    id: "tema",
    name: "Тёма",
    emoji: "🎨",
    role: "Дизайнер",
    description: "Креативный дизайнер. Создаёт визуальный контент, баннеры, иллюстрации.",
    positionX: 150,
    positionY: 350,
    currentStatus: "thinking",
  },
  {
    id: "pushkin",
    name: "Пушкин",
    emoji: "✍️",
    role: "Копирайтер",
    description: "Мастер слова. Пишет статьи, посты, сценарии и тексты.",
    positionX: 400,
    positionY: 350,
    currentStatus: "working",
  },
  {
    id: "coder",
    name: "Володя",
    emoji: "🔧",
    role: "Технический специалист",
    description: "Технический гуру. Код, деплой, интеграции, автоматизация.",
    positionX: 150,
    positionY: 550,
    currentStatus: "idle",
  },
  {
    id: "garik",
    name: "Гарик",
    emoji: "📈",
    role: "Маркетолог",
    description: "Маркетинг-стратег. Аналитика, продвижение, социальные сети.",
    positionX: 400,
    positionY: 550,
    currentStatus: "idle",
  },
  {
    id: "stoyanov",
    name: "Стоянов",
    emoji: "🎬",
    role: "Продюсер",
    description: "Продюсер контента. Видео, подкасты, медиапроизводство.",
    positionX: 650,
    positionY: 550,
    currentStatus: "idle",
  },
];

const insertAgent = sqlite.prepare(
  "INSERT OR REPLACE INTO agents (id, name, emoji, role, description, position_x, position_y, current_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
);

for (const agent of agentsData) {
  insertAgent.run(
    agent.id,
    agent.name,
    agent.emoji,
    agent.role,
    agent.description,
    agent.positionX,
    agent.positionY,
    agent.currentStatus
  );
}

console.log("Agents seeded.");

// Seed a demo project
const projectId = uuidv4();
const insertProject = sqlite.prepare(
  "INSERT OR REPLACE INTO projects (id, name, description, status) VALUES (?, ?, ?, ?)"
);
insertProject.run(projectId, "Фабрика Контента", "Основной проект по созданию контента", "active");

console.log("Project seeded.");

// Seed demo tasks
const tasksData = [
  { title: "Составить контент-план на март", status: "in_progress", priority: "high", assignedTo: "vanya" },
  { title: "Дизайн баннера для Instagram", status: "todo", priority: "medium", assignedTo: "tema" },
  { title: "Написать статью про AI-тренды", status: "in_progress", priority: "high", assignedTo: "pushkin" },
  { title: "Настроить CI/CD pipeline", status: "review", priority: "medium", assignedTo: "coder" },
  { title: "Аналитика соцсетей за февраль", status: "todo", priority: "low", assignedTo: "garik" },
  { title: "Смонтировать видео-обзор", status: "todo", priority: "medium", assignedTo: "stoyanov" },
  { title: "Обновить лендинг", status: "done", priority: "high", assignedTo: "coder" },
  { title: "Публикация в LinkedIn", status: "done", priority: "medium", assignedTo: "garik" },
];

const insertTask = sqlite.prepare(
  "INSERT INTO tasks (id, project_id, title, status, priority, assigned_to, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)"
);

for (const task of tasksData) {
  insertTask.run(uuidv4(), projectId, task.title, task.status, task.priority, task.assignedTo, adminId);
}

console.log("Tasks seeded.");

// Seed some activity logs
const insertActivity = sqlite.prepare(
  "INSERT INTO activity_logs (id, entity_type, entity_id, action, details, user_id) VALUES (?, ?, ?, ?, ?, ?)"
);

const activities = [
  { type: "agent", id: "vanya", action: "status_changed", details: '{"status":"working","statusText":"Планирую контент на неделю"}' },
  { type: "agent", id: "pushkin", action: "status_changed", details: '{"status":"working","statusText":"Пишу статью про AI"}' },
  { type: "task", id: "system", action: "created", details: '{"message":"Новая задача создана: Составить контент-план"}' },
  { type: "system", id: "system", action: "info", details: '{"message":"Система запущена"}' },
];

for (const activity of activities) {
  insertActivity.run(uuidv4(), activity.type, activity.id, activity.action, activity.details, adminId);
}

console.log("Activity logs seeded.");
console.log("\nDatabase seeded successfully!");
console.log(`Database path: ${dbPath}`);

sqlite.close();
