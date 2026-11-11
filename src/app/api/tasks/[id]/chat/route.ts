import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import crypto from "crypto";

const DB_PATH = process.cwd() + "/data/database.sqlite";

// Map agent IDs to OpenClaw session keys
const AGENT_SESSIONS: Record<string, string> = {
  vanya: "agent:main",
  tema: "agent:designer",
  pushkin: "agent:copywriter",
  volodya: "agent:tech",
  garik: "agent:marketer",
  stoyanov: "agent:urolog",
  ded: "agent:ded",
  proshka: "agent:proshka",
  gary: "agent:gary",
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: taskId } = await params;
    const body = await request.json();
    const { message } = body;

    if (!message?.trim()) {
      return NextResponse.json({ error: "message required" }, { status: 400 });
    }

    const db = new Database(DB_PATH, { readonly: false });

    // Get task with agent
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
      return NextResponse.json({ error: "No agent assigned" }, { status: 400 });
    }

    // Save user comment
    const commentId = crypto.randomUUID();
    db.prepare(`
      INSERT INTO task_comments (id, task_id, author_type, author_id, body, created_at)
      VALUES (?, ?, 'user', 'max', ?, datetime('now'))
    `).run(commentId, taskId, message.trim());

    // Get recent chat history for context
    const recentLogs = db.prepare(`
      SELECT message, created_at FROM task_logs WHERE task_id = ? ORDER BY created_at DESC LIMIT 5
    `).all(taskId) as Array<{ message: string; created_at: string }>;

    const recentComments = db.prepare(`
      SELECT author_type, author_id, body, created_at FROM task_comments WHERE task_id = ? ORDER BY created_at DESC LIMIT 10
    `).all(taskId) as Array<{ author_type: string; author_id: string; body: string; created_at: string }>;

    db.close();

    // Build context message for agent
    const chatHistory = recentComments
      .reverse()
      .map(c => `${c.author_type === 'user' ? 'User' : c.author_id}: ${c.body}`)
      .join('\n');

    const agentMessage = [
      `📋 ЗАДАЧА: ${task.title}`,
      task.description ? `Описание: ${task.description}` : '',
      `Task ID: ${taskId}`,
      '',
      chatHistory ? `--- Переписка ---\n${chatHistory}` : '',
      '',
      `Пользователь пишет: ${message.trim()}`,
      '',
      `Ответь по задаче. Когда закончишь — обнови статус:`,
      `curl -X POST http://localhost:3000/api/tasks/${taskId}/status -H "Content-Type: application/json" -d '{"status":"done","message":"<что сделал>","agentId":"${task.assigned_to}"}'`,
      `Для промежуточного отчёта:`,
      `curl -X POST http://localhost:3000/api/tasks/${taskId}/status -H "Content-Type: application/json" -d '{"message":"<статус>","agentId":"${task.assigned_to}"}'`,
    ].filter(Boolean).join('\n');

    // Send to agent via OpenClaw sessions_send
    // We can't use sessions_send directly from API, so we write to a queue
    // that the tech agent (or cron) picks up
    const queueId = crypto.randomUUID();
    const queueDb = new Database(DB_PATH, { readonly: false });
    
    // Create queue table if not exists
    queueDb.exec(`
      CREATE TABLE IF NOT EXISTS task_message_queue (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        message TEXT NOT NULL,
        processed INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    queueDb.prepare(`
      INSERT INTO task_message_queue (id, task_id, agent_id, message, created_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `).run(queueId, taskId, task.assigned_to, agentMessage);

    queueDb.close();

    return NextResponse.json({ 
      ok: true, 
      commentId,
      queued: true,
      agentName: task.agent_name,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
