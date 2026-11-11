import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import { readFileSync } from "fs";
import { join } from "path";

const DB_PATH = join(process.cwd(), "data", "database.sqlite");

// Map dashboard agent IDs to Telegram bot tokens + chat IDs
interface AgentTelegram {
  accountId: string;
  chatId: string;
}

// Agent Telegram mappings — loaded from config
function getAgentTelegram(): Record<string, AgentTelegram> {
  try {
    const configPath = join(process.cwd(), 'config', 'office.json');
    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    return config.agentTelegram || {};
  } catch { return {}; }
}
const AGENT_TELEGRAM = getAgentTelegram();

function getBotToken(accountId: string): string | null {
  try {
    const raw = readFileSync(join(process.env.HOME || "/root", ".openclaw", "openclaw.json"), "utf-8");
    const config = JSON.parse(raw);
    // Try per-account token first, fallback to global bot token
    return config.channels?.telegram?.accounts?.[accountId]?.botToken
      || config.channels?.telegram?.botToken
      || null;
  } catch {
    return null;
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: taskId } = await params;
    const db = new Database(DB_PATH, { readonly: false });

    // Get task
    const task = db.prepare(`
      SELECT t.*, a.name as agent_name, a.emoji as agent_emoji 
      FROM tasks t 
      LEFT JOIN agents a ON t.assigned_to = a.id 
      WHERE t.id = ?
    `).get(taskId) as Record<string, string> | undefined;

    if (!task) {
      db.close();
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    if (!task.assigned_to) {
      db.close();
      return NextResponse.json({ error: "Task has no assignee" }, { status: 400 });
    }

    const agentTg = AGENT_TELEGRAM[task.assigned_to];
    if (!agentTg) {
      db.close();
      return NextResponse.json({ error: `No Telegram mapping for agent: ${task.assigned_to}` }, { status: 400 });
    }

    const botToken = getBotToken(agentTg.accountId);
    if (!botToken) {
      db.close();
      return NextResponse.json({ error: "Cannot read bot token" }, { status: 500 });
    }

    // Format task message for agent
    const priorityEmoji: Record<string, string> = { high: "🔴", medium: "🟡", low: "🟢" };
    const message = [
      `📋 <b>Новая задача из Mission Control</b>`,
      ``,
      `<b>${task.title}</b>`,
      task.description ? `${task.description}` : "",
      ``,
      `Приоритет: ${priorityEmoji[task.priority] || "⚪"} ${task.priority}`,
      task.due_date ? `Дедлайн: ${task.due_date}` : "",
      ``,
      `Task ID: <code>${taskId}</code>`,
      `Когда выполнишь — отпиши результат.`,
    ].filter(Boolean).join("\n");

    // Send via Telegram Bot API directly to agent's chat
    const resp = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: agentTg.chatId,
        text: message,
        parse_mode: "HTML",
      }),
    });

    const tgResult = await resp.json();
    if (!tgResult.ok) {
      db.close();
      return NextResponse.json(
        { ok: false, error: `Telegram error: ${tgResult.description}` },
        { status: 502 }
      );
    }

    // Update task status to in_progress only after successful Telegram send.
    db.prepare("UPDATE tasks SET status = 'in_progress', updated_at = datetime('now') WHERE id = ?").run(taskId);

    // Log the successful dispatch.
    const logId = crypto.randomUUID();
    db.prepare(`
      INSERT INTO task_logs (id, task_id, agent_id, message, created_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `).run(logId, taskId, task.assigned_to, `📤 Отправлено агенту ${task.agent_name} через Telegram`);

    db.close();

    return NextResponse.json({
      ok: true,
      dispatched: true,
      agentName: task.agent_name,
      messageId: tgResult.result?.message_id,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Dispatch failed", detail: String(err) },
      { status: 500 }
    );
  }
}
