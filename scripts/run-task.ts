import Database from "better-sqlite3";
import OpenAI from "openai";
import path from "path";
import { v4 as uuidv4 } from "uuid";

const dbPath = path.resolve(process.cwd(), process.env.DATABASE_URL || "./data/database.sqlite");
const db = new Database(dbPath);
db.pragma("journal_mode = WAL");

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const TASK_ID = process.argv[2];

if (!TASK_ID) {
  console.error("Usage: run-task.ts <task_id>");
  process.exit(1);
}

const ROLE_PROMPTS: Record<string, string> = {
  "Техлид": `Ты — опытный техлид. Тебе дают задачу — создай чёткий технический план:
- Разбивка на подзадачи
- Архитектурные решения
- Риски и как их избежать
Будь конкретным, без воды. Ответ на русском.`,

  "Разработчик": `Ты — опытный разработчик. Тебе дают задачу — напиши реализацию:
- Если нужен код — пиши код
- Если нужен план — пиши шаги реализации
- Укажи что потребуется (библиотеки, API, данные)
Будь конкретным. Ответ на русском.`,

  "QA-инженер": `Ты — QA-инженер. Тебе дают задачу — создай план тестирования:
- Список тест-кейсов
- Edge cases
- Критерии приёмки
Будь конкретным. Ответ на русском.`,

  "Координатор": `Ты — координатор проекта. Тебе дают задачу — составь план выполнения:
- Кому делегировать
- Порядок шагов
- Что нужно для старта
Ответ на русском.`,
};

const DEFAULT_PROMPT = `Ты — AI-агент. Выполни задачу профессионально и конкретно. Ответ на русском.`;

async function sendToTelegram(text: string) {
  if (!BOT_TOKEN || !CHAT_ID) return;
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: "HTML" }),
  });
}

async function main() {
  // Найти задачу (поддержка короткого ID)
  const task = TASK_ID.length < 36
    ? (db.prepare("SELECT * FROM tasks WHERE id LIKE ?").get(`${TASK_ID}%`) as any)
    : (db.prepare("SELECT * FROM tasks WHERE id = ?").get(TASK_ID) as any);

  if (!task) {
    console.error(`Task not found: ${TASK_ID}`);
    process.exit(1);
  }

  const agent = task.assigned_to
    ? (db.prepare("SELECT * FROM agents WHERE id = ?").get(task.assigned_to) as any)
    : null;

  console.log(`[run-task] Task: "${task.title}" → ${agent?.name ?? "no agent"}`);

  // Агент переходит в thinking
  if (agent) {
    db.prepare("UPDATE agents SET current_status = 'thinking' WHERE id = ?").run(agent.id);
    db.prepare(`INSERT INTO agent_status_history (id, agent_id, status, status_text) VALUES (?, ?, ?, ?)`).run(
      uuidv4(), agent.id, "thinking", `Работаю над: ${task.title}`
    );
  }

  // Задача → in_progress
  db.prepare("UPDATE tasks SET status = 'in_progress', updated_at = ? WHERE id = ?").run(
    new Date().toISOString(), task.id
  );

  // Вызов qwen3-coder
  const systemPrompt = agent?.role ? (ROLE_PROMPTS[agent.role] ?? DEFAULT_PROMPT) : DEFAULT_PROMPT;
  const client = new OpenAI({ baseURL: "http://localhost:18080/v1", apiKey: "ollama" });

  console.log(`[run-task] Calling qwen3-coder:480b-cloud...`);
  const response = await client.chat.completions.create({
    model: "qwen3-coder:480b-cloud",
    max_tokens: 2000,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Задача: ${task.title}` },
    ],
  });

  const result = response.choices[0].message.content ?? "";
  console.log(`[run-task] Result (${result.length} chars):\n${result.slice(0, 200)}...`);

  // Логируем активность
  db.prepare(`INSERT INTO activity_logs (id, entity_type, entity_id, action, details) VALUES (?, ?, ?, ?, ?)`).run(
    uuidv4(), "agent", agent?.id ?? "unknown", "task_run",
    JSON.stringify({ taskId: task.id, title: task.title, result: result.slice(0, 500) })
  );

  // Обновляем статус агента
  if (agent) {
    const statusText = result.split("\n")[0].slice(0, 120);
    db.prepare("UPDATE agents SET current_status = 'idle' WHERE id = ?").run(agent.id);
    db.prepare(`INSERT INTO agent_status_history (id, agent_id, status, status_text) VALUES (?, ?, ?, ?)`).run(
      uuidv4(), agent.id, "idle", statusText
    );
  }

  // Задача → done
  db.prepare("UPDATE tasks SET status = 'done', updated_at = ? WHERE id = ?").run(
    new Date().toISOString(), task.id
  );

  // Отправляем результат в Telegram
  const shortId = task.id.slice(0, 8);
  const agentLabel = agent ? `${agent.emoji} ${agent.name}` : "Агент";
  const msg = `✅ <b>${agentLabel}</b> выполнил задачу <code>${shortId}</code>\n<b>${task.title}</b>\n\n${result.slice(0, 3000)}`;
  await sendToTelegram(msg);

  console.log("[run-task] Done.");
}

main().catch((e) => {
  console.error("[run-task] Error:", e.message);
  process.exit(1);
});
