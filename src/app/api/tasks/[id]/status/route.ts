import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import crypto from "crypto";

const DB_PATH = process.cwd() + "/data/database.sqlite";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: taskId } = await params;
    const body = await request.json();
    const { status, message, agentId } = body;

    if (!status && !message) {
      return NextResponse.json({ error: "status or message required" }, { status: 400 });
    }

    const db = new Database(DB_PATH, { readonly: false });

    // Verify task exists
    const task = db.prepare("SELECT id FROM tasks WHERE id = ?").get(taskId);
    if (!task) {
      db.close();
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // Update status if provided
    if (status) {
      db.prepare("UPDATE tasks SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, taskId);
    }

    // Add log entry if message provided
    if (message) {
      const logId = crypto.randomUUID();
      db.prepare(`
        INSERT INTO task_logs (id, task_id, agent_id, message, created_at)
        VALUES (?, ?, ?, ?, datetime('now'))
      `).run(logId, taskId, agentId || null, message);
    }

    db.close();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
