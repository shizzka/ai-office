/**
 * Multi-agent pipeline:
 * User request → Vanya (delegate) → Lider (plan) → Coder (implement) → QA (review)
 */
import Database from "better-sqlite3";
import OpenAI from "openai";
import path from "path";
import { v4 as uuidv4 } from "uuid";

const dbPath = path.resolve(process.cwd(), process.env.DATABASE_URL || "./data/database.sqlite");
const db = new Database(dbPath);
db.pragma("journal_mode = WAL");

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const USER_REQUEST = process.argv.slice(2).join(" ");

if (!USER_REQUEST) {
  console.error("Usage: pipeline.ts <user request>");
  process.exit(1);
}

const client = new OpenAI({ baseURL: "http://localhost:18080/v1", apiKey: "ollama" });

// ──────────────── Telegram ────────────────

async function send(text: string) {
  if (!BOT_TOKEN || !CHAT_ID) return;
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: "HTML" }),
    });
  } catch {}
}

// ──────────────── DB helpers ────────────────

function setAgentStatus(agentId: string, status: string, statusText: string) {
  db.prepare("UPDATE agents SET current_status = ? WHERE id = ?").run(status, agentId);
  db.prepare(
    "INSERT INTO agent_status_history (id, agent_id, status, status_text) VALUES (?, ?, ?, ?)"
  ).run(uuidv4(), agentId, status, statusText);
}

function logActivity(agentId: string, action: string, details: object) {
  db.prepare(
    "INSERT INTO activity_logs (id, entity_type, entity_id, action, details) VALUES (?, ?, ?, ?, ?)"
  ).run(uuidv4(), "agent", agentId, action, JSON.stringify(details));
}

function getAgent(id: string): { name: string; emoji: string; role: string } | null {
  return db.prepare("SELECT name, emoji, role FROM agents WHERE id = ?").get(id) as any;
}

// ──────────────── LLM call ────────────────

async function callAgent(agentId: string, system: string, userMsg: string): Promise<string> {
  const agent = getAgent(agentId);
  if (!agent) throw new Error(`Agent ${agentId} not found`);

  setAgentStatus(agentId, "thinking", userMsg.slice(0, 100));
  logActivity(agentId, "thinking", { message: userMsg.slice(0, 120) });

  console.log(`[pipeline] ${agent.emoji} ${agent.name} thinking...`);

  // Try cloud first, fall back to local on error
  const models = ["qwen3-coder:480b-cloud", "qwen3-coder:30b"];
  let lastError: Error | null = null;

  for (const model of models) {
    try {
      const response = await client.chat.completions.create({
        model,
        max_tokens: 1500,
        messages: [
          { role: "system", content: system },
          { role: "user", content: userMsg },
        ],
      });

      const result = response.choices[0].message.content ?? "";
      if (!result) throw new Error("Empty response");

      console.log(`[pipeline] ${agent.name} done (model: ${model})`);
      setAgentStatus(agentId, "idle", result.split("\n")[0].slice(0, 120));
      logActivity(agentId, "done", { message: result.slice(0, 300), model });
      return result;
    } catch (e: any) {
      console.error(`[pipeline] ${agent.name} failed on ${model}: ${e.message}`);
      lastError = e;
      // small pause before fallback
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  throw lastError ?? new Error("All models failed");
}

// ──────────────── Agent prompts ────────────────

const VANYA_PROMPT = `Ты — Ванечка, координатор AI-офиса. Пользователь пришёл с запросом.
Твоя задача: сформулировать чёткое техническое задание для Лида (техлид команды разработки).
- Уточни цель и требования
- Определи критерии готовности
- Будь кратким и конкретным
Ответ на русском, не более 150 слов.`;

const LIDER_PROMPT = `Ты — Лид, техлид команды разработки. Ваня передал тебе задачу от пользователя.
Твоя задача: написать технический план для Кодера.
- Что именно нужно реализовать (конкретные шаги)
- Какие инструменты/библиотеки использовать
- На что обратить внимание
Ответ на русском, не более 200 слов.`;

const CODER_PROMPT = `Ты — Кодер, разработчик. Лид дал тебе техплан.
Твоя задача: написать рабочий код.
- Пиши чистый, рабочий код
- Добавь краткие комментарии
- Если нужны несколько файлов — покажи все
Ответ: код с минимальными пояснениями.`;

const QA_PROMPT = `Ты — QA-инженер. Кодер написал решение.
Твоя задача: проверить и дать фидбек.
- Что работает хорошо
- Что стоит улучшить или проверить
- Тест-кейсы (если нужны)
Ответ на русском, кратко и по делу.`;

// ──────────────── Pipeline ────────────────

async function main() {
  console.log(`[pipeline] Starting pipeline for: "${USER_REQUEST}"`);
  await send(`🎯 <b>Ванечка</b> получил задачу:\n<i>${USER_REQUEST}</i>\n\nЗапускаю команду...`);

  // Step 1: Ваня формулирует задачу
  const vanyaOut = await callAgent(
    "vanya",
    VANYA_PROMPT,
    `Запрос пользователя: ${USER_REQUEST}`
  );
  await send(`🎯 <b>Ванечка → Лиду:</b>\n${vanyaOut}`);

  // Step 2: Лид делает техплан
  const liderOut = await callAgent(
    "lider",
    LIDER_PROMPT,
    `Задача от Ванечки:\n${vanyaOut}`
  );
  await send(`🧭 <b>Лид → Кодеру:</b>\n${liderOut}`);

  // Step 3: Кодер пишет код
  const coderOut = await callAgent(
    "coder",
    CODER_PROMPT,
    `Задача пользователя: ${USER_REQUEST}\n\nТехплан от Лида:\n${liderOut}`
  );
  await send(`💻 <b>Кодер сделал:</b>\n<pre>${coderOut.slice(0, 3500)}</pre>`);

  // Step 4: QA проверяет
  const qaOut = await callAgent(
    "qa",
    QA_PROMPT,
    `Задача: ${USER_REQUEST}\n\nРешение от Кодера:\n${coderOut}`
  );
  await send(`🔍 <b>QA проверил:</b>\n${qaOut}`);

  await send(`✅ <b>Задача выполнена!</b>\nЗапрос: <i>${USER_REQUEST}</i>`);
  console.log("[pipeline] Done.");
}

main().catch((e) => {
  console.error("[pipeline] Error:", e.message);
  send(`❌ Ошибка в pipeline: ${e.message}`).finally(() => process.exit(1));
});
