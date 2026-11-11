import Database from "better-sqlite3";
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
  archived INTEGER NOT NULL DEFAULT 0,
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
  archived INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'active',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  archived INTEGER NOT NULL DEFAULT 0,
  project_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  status_detail TEXT,
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

CREATE TABLE IF NOT EXISTS activity_logs (
  archived INTEGER NOT NULL DEFAULT 0,
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

CREATE TABLE IF NOT EXISTS healthchecks (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  endpoint TEXT NOT NULL,
  interval TEXT NOT NULL DEFAULT 'daily',
  status TEXT NOT NULL DEFAULT 'unknown',
  ok_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  last_error_code TEXT,
  last_message TEXT,
  last_run_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
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

CREATE TABLE IF NOT EXISTS task_comments (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  author_type TEXT NOT NULL,
  author_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);
`;

export function runMigrations() {
  const statements = migrations
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const statement of statements) {
    sqlite.exec(statement);
  }

  // Preserve every row; archive flags can be restored independently.
  for (const table of ["agents", "tasks", "projects", "activity_logs"]) {
    const columns = sqlite.pragma(`table_info(${table})`) as { name: string }[];
    if (!columns.some((column) => column.name === "archived")) {
      sqlite.exec(`ALTER TABLE ${table} ADD COLUMN archived INTEGER NOT NULL DEFAULT 0`);
    }
  }
  const taskColumns = sqlite.pragma("table_info(tasks)") as { name: string }[];
  if (!taskColumns.some((column) => column.name === "status_detail")) {
    sqlite.exec("ALTER TABLE tasks ADD COLUMN status_detail TEXT");
  }
}

// Run directly if called as script
if (typeof require !== "undefined" && require.main === module) {
  runMigrations();
  console.log("Migrations completed successfully");
  sqlite.close();
}
