// Optional demo for a new database. Never reads the live installation.
import { runMigrations } from "../src/lib/db/migrate";
import Database from "better-sqlite3";
import path from "node:path";
runMigrations();
const db = new Database(path.resolve(process.env.DATABASE_URL || "./data/database.sqlite"));
try {
  const count = db.prepare("SELECT COUNT(*) AS n FROM agents").get() as {n:number};
  if (count.n) throw new Error("Demo requires a fresh database without agents");
  db.transaction(() => {
    const insert = db.prepare("INSERT INTO agents (id,name,emoji,role,position_x,position_y,current_status) VALUES (?,?,?,?,?,?,?)");
    for (const row of [["bridge-yarik","Ярик","🏗️","Архитектор",200,300,"idle"],["bridge-leha","Лёха","💻","Разработчик",350,300,"working"],["bridge-asya","Ася","🔍","Критик",500,300,"idle"],["bridge-taya","Тая","🎨","Дизайнер",650,300,"idle"]]) insert.run(...row);
    db.prepare("INSERT INTO projects (id,name,description) VALUES (?,?,?)").run("demo","Офис","Пример команды AI-агентов");
    const task=db.prepare("INSERT INTO tasks (id,project_id,title,description,status,priority,assigned_to) VALUES (?,?,?,?,?,?,?)");
    task.run("demo-1","demo","Обновить интерфейс","Улучшить навигацию и адаптацию","in_progress","high","bridge-leha");
    task.run("demo-2","demo","Проверить результат","Независимая проверка перед выпуском","review","medium","bridge-asya");
    task.run("demo-3","demo","Подготовить план","План работ согласован","done","medium","bridge-yarik");
    task.run("demo-4","demo","Обновить иллюстрации","Следующая задача команды","todo","low","bridge-taya");
  })();
  console.log("Demo ready; no login credentials created.");
} finally { db.close(); }
