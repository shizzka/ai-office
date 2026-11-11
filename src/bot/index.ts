import { Bot } from "grammy";
import { spawn } from "child_process";
import path from "path";
import {
  getAllAgents,
  getAgent,
  updateAgentStatus,
  getActiveTasks,
  getRecentFeed,
  getTokenStats,
  createTask,
  closeTask,
  getAgentTasks,
  setAgentDoing,
} from "./db";
import { startNotifier } from "./notify";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

if (!BOT_TOKEN) throw new Error("TELEGRAM_BOT_TOKEN is not set");
if (!CHAT_ID) throw new Error("TELEGRAM_CHAT_ID is not set");

const ALLOWED_IDS = new Set([CHAT_ID, "133154291"]);

const bot = new Bot(BOT_TOKEN);

function h(str: string | null | undefined): string {
  return (str ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const HTML = { parse_mode: "HTML" as const };

// Auth middleware
bot.use(async (ctx, next) => {
  const id = ctx.chat?.id?.toString() ?? ctx.from?.id?.toString();
  if (!id || !ALLOWED_IDS.has(id)) {
    await ctx.reply("⛔ Access denied.");
    return;
  }
  await next();
});

// Error handler
bot.catch((err) => {
  console.error("[bot] error:", err.message);
});

const STATUS_EMOJI: Record<string, string> = {
  idle: "💤",
  working: "⚙️",
  thinking: "🤔",
  busy: "🔴",
  offline: "⚫",
};

// /start
bot.command("start", async (ctx) => {
  await ctx.reply(
    `👋 <b>AI Office Bot</b>\n\n` +
      `<b>Просмотр:</b>\n` +
      `/status — все агенты\n` +
      `/agent &lt;id&gt; — детальный статус агента\n` +
      `/tasks [agent_id] — задачи (все или агента)\n` +
      `/feed — последние 10 событий\n` +
      `/stats — статистика токенов\n\n` +
      `<b>Управление:</b>\n` +
      `/ask &lt;запрос&gt; — отдать задачу команде (Ваня→Лид→Кодер→QA)\n` +
      `/set &lt;agent_id&gt; &lt;status&gt; — сменить статус\n` +
      `/doing &lt;agent_id&gt; &lt;текст&gt; — агент работает над...\n` +
      `/newtask &lt;agent_id&gt; &lt;название&gt; — создать задачу\n` +
      `/run &lt;task_id&gt; — запустить задачу (qwen3-coder)\n` +
      `/done &lt;task_id&gt; — закрыть задачу`,
    HTML
  );
});

// /status
bot.command("status", async (ctx) => {
  const agents = await getAllAgents();
  if (agents.length === 0) {
    await ctx.reply("Агенты не найдены.");
    return;
  }
  const lines = agents.map((a) => {
    const emoji = STATUS_EMOJI[a.currentStatus ?? "offline"] ?? "❓";
    return `${emoji} <b>${h(a.name)}</b> (<code>${h(a.id)}</code>) — ${h(a.currentStatus ?? "unknown")}`;
  });
  await ctx.reply(`🏢 <b>Агенты AI Office</b>\n\n${lines.join("\n")}`, HTML);
});

// /agent <id>
bot.command("agent", async (ctx) => {
  const id = ctx.match?.trim();
  if (!id) {
    await ctx.reply("Использование: /agent &lt;id&gt;", HTML);
    return;
  }
  const result = await getAgent(id);
  if (!result) {
    await ctx.reply(`Агент <code>${h(id)}</code> не найден.`, HTML);
    return;
  }
  const { agent, lastStatus } = result;
  const emoji = STATUS_EMOJI[agent.currentStatus ?? "offline"] ?? "❓";
  let text =
    `${emoji} <b>${h(agent.name)}</b>\n` +
    `ID: <code>${h(agent.id)}</code>\n` +
    `Роль: ${h(agent.role)}\n` +
    `Статус: ${h(agent.currentStatus ?? "unknown")}\n`;
  if (agent.description) text += `Описание: ${h(agent.description)}\n`;
  if (lastStatus) {
    text += `\nПоследнее изменение статуса:\n`;
    text += `  <b>${h(lastStatus.status)}</b>`;
    if (lastStatus.statusText) text += ` — ${h(lastStatus.statusText)}`;
    if (lastStatus.startedAt) text += `\n  ${new Date(lastStatus.startedAt).toLocaleString("ru-RU")}`;
  }
  await ctx.reply(text, HTML);
});

// /tasks [agent_id]
bot.command("tasks", async (ctx) => {
  const agentId = ctx.match?.trim();

  if (agentId) {
    const result = await getAgentTasks(agentId);
    if (!result) {
      await ctx.reply(`Агент <code>${h(agentId)}</code> не найден.`, HTML);
      return;
    }
    const { agent, tasks } = result;
    if (tasks.length === 0) {
      await ctx.reply(`У <b>${h(agent.name)}</b> нет задач.`, HTML);
      return;
    }
    const PRIORITY_EMOJI: Record<string, string> = { low: "🟢", medium: "🟡", high: "🟠", urgent: "🔴" };
    const STATUS_LABEL: Record<string, string> = { todo: "todo", in_progress: "в работе", review: "ревью", done: "✅" };
    const lines = tasks.map((t) => {
      const p = PRIORITY_EMOJI[t.priority ?? "medium"] ?? "⚪";
      const s = STATUS_LABEL[t.status ?? "todo"] ?? t.status ?? "";
      return `${p} <code>${t.id.slice(0, 8)}</code> <b>${h(t.title)}</b> [${s}]`;
    });
    await ctx.reply(`📋 <b>Задачи ${h(agent.name)}</b> (${tasks.length}):\n\n${lines.join("\n")}`, HTML);
    return;
  }

  const tasks = await getActiveTasks();
  if (tasks.length === 0) {
    await ctx.reply("Нет активных задач.");
    return;
  }
  const PRIORITY_EMOJI: Record<string, string> = { low: "🟢", medium: "🟡", high: "🟠", urgent: "🔴" };
  const lines = tasks.map((t) => {
    const p = PRIORITY_EMOJI[t.priority ?? "medium"] ?? "⚪";
    const assignee = t.agentName ? ` → ${h(t.agentName)}` : "";
    return `${p} <code>${t.id.slice(0, 8)}</code> <b>${h(t.title)}</b> [${h(t.status ?? "")}]${assignee}`;
  });
  await ctx.reply(`📋 <b>Активные задачи</b> (${tasks.length}):\n\n${lines.join("\n")}`, HTML);
});

// /set <agent_id> <status>
bot.command("set", async (ctx) => {
  const parts = ctx.match?.trim().split(/\s+/);
  if (!parts || parts.length < 2) {
    await ctx.reply("Использование: /set &lt;agent_id&gt; &lt;idle|working|thinking|busy|offline&gt;", HTML);
    return;
  }
  const [agentId, rawStatus] = parts;
  const validStatuses = ["idle", "working", "thinking", "busy", "offline"] as const;
  const status = rawStatus as (typeof validStatuses)[number];
  if (!validStatuses.includes(status)) {
    await ctx.reply(`Недопустимый статус: ${h(rawStatus)}\nДопустимые: ${validStatuses.join(", ")}`, HTML);
    return;
  }
  const agent = await updateAgentStatus(agentId, status);
  if (!agent) {
    await ctx.reply(`Агент <code>${h(agentId)}</code> не найден.`, HTML);
    return;
  }
  const emoji = STATUS_EMOJI[status];
  await ctx.reply(`${emoji} <b>${h(agent.name)}</b> → <code>${status}</code>`, HTML);
});

// /feed
bot.command("feed", async (ctx) => {
  const logs = await getRecentFeed(10);
  if (logs.length === 0) {
    await ctx.reply("Нет событий.");
    return;
  }
  const lines = logs.map((log) => {
    const time = log.createdAt ? new Date(log.createdAt).toLocaleTimeString("ru-RU") : "?";
    return `[${time}] ${h(log.action)} — ${h(log.entityType)}/${h(log.entityId.slice(0, 8))}`;
  });
  await ctx.reply(`📡 <b>Последние события</b>:\n\n${lines.join("\n")}`, HTML);
});

// /stats
bot.command("stats", async (ctx) => {
  const stats = await getTokenStats();
  const costStr = stats.totalCost > 0 ? `$${stats.totalCost.toFixed(4)}` : "нет данных";
  await ctx.reply(
    `📊 <b>Статистика токенов</b>\n\n` +
      `Событий openclaw: ${stats.eventCount}\n` +
      `Input токенов: ${stats.totalInputTokens.toLocaleString()}\n` +
      `Output токенов: ${stats.totalOutputTokens.toLocaleString()}\n` +
      `Стоимость: ${costStr}`,
    HTML
  );
});

// /doing <agent_id> <text>  — set status to working + statusText
bot.command("doing", async (ctx) => {
  const parts = ctx.match?.trim().split(/\s+/);
  if (!parts || parts.length < 2) {
    await ctx.reply("Использование: /doing &lt;agent_id&gt; &lt;что делает&gt;", HTML);
    return;
  }
  const [agentId, ...rest] = parts;
  const statusText = rest.join(" ");
  const agent = await setAgentDoing(agentId, statusText, "working");
  if (!agent) {
    await ctx.reply(`Агент <code>${h(agentId)}</code> не найден.`, HTML);
    return;
  }
  await ctx.reply(`⚙️ <b>${h(agent.name)}</b> теперь работает над:\n<i>${h(statusText)}</i>`, HTML);
});

// /newtask <agent_id> <title>
bot.command("newtask", async (ctx) => {
  const parts = ctx.match?.trim().split(/\s+/);
  if (!parts || parts.length < 2) {
    await ctx.reply("Использование: /newtask &lt;agent_id&gt; &lt;название задачи&gt;", HTML);
    return;
  }
  const [agentId, ...rest] = parts;
  const title = rest.join(" ");
  const result = await createTask(agentId, title);
  if (!result) {
    await ctx.reply(`Агент <code>${h(agentId)}</code> не найден.`, HTML);
    return;
  }
  await ctx.reply(
    `✅ Задача создана\n\nID: <code>${result.taskId.slice(0, 8)}</code>\nАгент: <code>${h(result.agentId)}</code>\nНазвание: <b>${h(result.title)}</b>`,
    HTML
  );
});

// /ask <request> — запустить multi-agent pipeline
bot.command("ask", async (ctx) => {
  const request = ctx.match?.trim();
  if (!request) {
    await ctx.reply("Использование: /ask &lt;что нужно сделать&gt;", HTML);
    return;
  }

  await ctx.reply(`🎯 Передаю Ванечке: <i>${h(request)}</i>\n\nКоманда начала работу, апдейты придут сюда.`, HTML);

  const scriptPath = path.resolve(process.cwd(), "scripts/pipeline.ts");
  const child = spawn(
    "npx", ["tsx", "--env-file=.env.local", scriptPath, ...request.split(" ")],
    { cwd: process.cwd(), detached: true, stdio: "pipe" }
  );

  child.stderr.on("data", (data: Buffer) => console.error("[pipeline]", data.toString().trim()));
  child.stdout.on("data", (data: Buffer) => console.log("[pipeline]", data.toString().trim()));
  child.unref();
});

// /run <task_id> — запустить задачу через qwen3-coder
bot.command("run", async (ctx) => {
  const taskId = ctx.match?.trim();
  if (!taskId) {
    await ctx.reply("Использование: /run &lt;task_id&gt;", HTML);
    return;
  }

  await ctx.reply(`🤖 Запускаю задачу <code>${h(taskId)}</code>...\nРезультат придёт сюда когда агент закончит.`, HTML);

  const scriptPath = path.resolve(process.cwd(), "scripts/run-task.ts");
  const child = spawn(
    "npx", ["tsx", "--env-file=.env.local", scriptPath, taskId],
    { cwd: process.cwd(), detached: true, stdio: "pipe" }
  );

  child.stderr.on("data", (data: Buffer) => {
    console.error("[run-task]", data.toString().trim());
  });
  child.stdout.on("data", (data: Buffer) => {
    console.log("[run-task]", data.toString().trim());
  });
  child.unref();
});

// /done <task_id>
bot.command("done", async (ctx) => {
  const taskId = ctx.match?.trim();
  if (!taskId) {
    await ctx.reply("Использование: /done &lt;task_id&gt;", HTML);
    return;
  }
  // Support short IDs (first 8 chars) — find full ID
  const task = await closeTask(taskId);
  if (!task) {
    await ctx.reply(`Задача <code>${h(taskId)}</code> не найдена.`, HTML);
    return;
  }
  await ctx.reply(`✅ Задача закрыта: <b>${h(task.title)}</b>`, HTML);
});

// Start
startNotifier(bot, CHAT_ID);

bot.start({
  onStart: () => console.log("Bot started"),
});
