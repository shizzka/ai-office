import Database from "better-sqlite3";
import OpenAI from "openai";
import path from "path";

const dbPath = path.resolve(process.cwd(), process.env.DATABASE_URL || "./data/database.sqlite");
const db = new Database(dbPath);
db.pragma("journal_mode = WAL");

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHANNEL_ID || process.env.TELEGRAM_CHAT_ID;

if (!BOT_TOKEN || !CHAT_ID) {
  console.error("TELEGRAM_BOT_TOKEN and TELEGRAM_CHANNEL_ID are required");
  process.exit(1);
}

async function getDailyData() {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  // Активность за сегодня
  const activity = db.prepare(`
    SELECT a.entity_id, ag.name, ag.emoji, a.action, a.details, a.created_at
    FROM activity_logs a
    LEFT JOIN agents ag ON ag.id = a.entity_id
    WHERE COALESCE(ag.archived, 0) = 0 AND a.entity_type = 'agent' AND a.created_at LIKE ?
    ORDER BY a.created_at DESC
    LIMIT 30
  `).all(`${today}%`) as any[];

  // Задачи закрытые сегодня
  const doneTasks = db.prepare(`
    SELECT t.title, t.priority, ag.name as agent_name, ag.emoji
    FROM tasks t
    LEFT JOIN agents ag ON ag.id = t.assigned_to
    WHERE t.archived = 0 AND NOT EXISTS (SELECT 1 FROM projects p WHERE p.id = t.project_id AND p.archived = 1)
      AND COALESCE(ag.archived, 0) = 0 AND t.status = 'done' AND t.updated_at LIKE ?
  `).all(`${today}%`) as any[];

  // Задачи в работе
  const activeTasks = db.prepare(`
    SELECT t.title, t.priority, ag.name as agent_name, ag.emoji
    FROM tasks t
    LEFT JOIN agents ag ON ag.id = t.assigned_to
    WHERE t.archived = 0 AND NOT EXISTS (SELECT 1 FROM projects p WHERE p.id = t.project_id AND p.archived = 1)
      AND COALESCE(ag.archived, 0) = 0 AND t.status IN ('todo', 'in_progress')
    ORDER BY t.created_at DESC
    LIMIT 10
  `).all() as any[];

  // Статусы агентов
  const agents = db.prepare(`
    SELECT id, name, emoji, role, current_status
    FROM agents WHERE archived = 0 AND current_status != 'offline'
  `).all() as any[];

  return { activity, doneTasks, activeTasks, agents, date: today };
}

function buildContext(data: Awaited<ReturnType<typeof getDailyData>>): string {
  const lines: string[] = [];

  lines.push(`Дата: ${data.date}`);

  lines.push(`\nАктивные агенты: ${data.agents.map((a: any) => `${a.emoji} ${a.name} (${a.current_status})`).join(", ")}`);

  if (data.doneTasks.length > 0) {
    lines.push(`\nЗадачи выполнены сегодня:`);
    data.doneTasks.forEach((t: any) => {
      lines.push(`  - ${t.emoji || ""} ${t.agent_name || "?"}: ${t.title}`);
    });
  }

  if (data.activeTasks.length > 0) {
    lines.push(`\nЗадачи в работе:`);
    data.activeTasks.forEach((t: any) => {
      lines.push(`  - ${t.emoji || ""} ${t.agent_name || "?"}: ${t.title}`);
    });
  }

  if (data.activity.length > 0) {
    lines.push(`\nАктивность за день:`);
    const seen = new Set<string>();
    data.activity.forEach((a: any) => {
      try {
        const details = a.details ? JSON.parse(a.details) : {};
        const msg = details.message || details.statusText || a.action;
        const key = `${a.entity_id}:${msg}`;
        if (!seen.has(key)) {
          seen.add(key);
          lines.push(`  - ${a.emoji || ""} ${a.name || a.entity_id}: ${msg}`);
        }
      } catch {}
    });
  }

  return lines.join("\n");
}

async function generatePost(context: string): Promise<string> {
  const client = new OpenAI({
    baseURL: "http://localhost:18080/v1",
    apiKey: "ollama",
  });

  const response = await client.chat.completions.create({
    model: "qwen3:8b",
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: `Ты — копирайтер AI-офиса. Напиши короткий дайджест дня для Telegram-канала.

Данные об офисе за сегодня:
${context}

Требования:
- Живо и по-человечески, без официоза
- 3-5 предложений, можно с эмодзи
- Упомяни что делали агенты и какие задачи двигались
- Если мало данных — напиши что команда работала в штатном режиме
- Без хэштегов
- Заголовок: "📋 Офис сегодня"

Верни только текст поста.`,
      },
    ],
  });

  return response.choices[0].message.content ?? "";
}

async function sendToTelegram(text: string): Promise<void> {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: "HTML" }),
  });
  const data = await res.json() as any;
  if (!data.ok) throw new Error(`Telegram error: ${JSON.stringify(data)}`);
}

async function main() {
  console.log("[daily-digest] Collecting data...");
  const data = await getDailyData();

  const context = buildContext(data);
  console.log("[daily-digest] Context:\n" + context);

  console.log("[daily-digest] Generating post...");
  const post = await generatePost(context);
  console.log("[daily-digest] Post:\n" + post);

  console.log("[daily-digest] Sending to Telegram...");
  await sendToTelegram(post);
  console.log("[daily-digest] Done.");
}

main().catch((e) => {
  console.error("[daily-digest] Error:", e.message);
  process.exit(1);
});
