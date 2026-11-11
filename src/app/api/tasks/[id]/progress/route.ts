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
    const { message, agentId, percent } = body;
    const agentKey = request.headers.get("x-agent-key");

    if (!message) {
      return NextResponse.json({ error: "message required" }, { status: 400 });
    }

    const db = new Database(DB_PATH, { readonly: false });

    let resolvedAgentId = agentId;
    if (agentKey && !resolvedAgentId) {
      const agent = db.prepare("SELECT id FROM agent_registry WHERE api_key = ?").get(agentKey) as { id: string } | undefined;
      if (agent) resolvedAgentId = agent.id;
    }

    // Ensure status is in_progress
    db.prepare("UPDATE tasks SET status = 'in_progress', updated_at = datetime('now') WHERE id = ? AND status != 'done'").run(taskId);

    const logId = crypto.randomUUID();
    const logMsg = percent ? `[${percent}%] ${message}` : message;
    db.prepare(`
      INSERT INTO task_logs (id, task_id, agent_id, message, created_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `).run(logId, taskId, resolvedAgentId, logMsg);

    db.close();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
