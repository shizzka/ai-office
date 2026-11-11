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
    const agentKey = request.headers.get("x-agent-key");

    const db = new Database(DB_PATH, { readonly: false });

    // Auth via API key or allow unauthenticated (for local agents)
    let agentId = null;
    if (agentKey) {
      const agent = db.prepare("SELECT id FROM agent_registry WHERE api_key = ?").get(agentKey) as { id: string } | undefined;
      if (agent) agentId = agent.id;
    }

    // Fallback: read agentId from body
    if (!agentId) {
      try {
        const body = await request.json();
        agentId = body.agentId;
      } catch { /* no body */ }
    }

    db.prepare("UPDATE tasks SET status = 'in_progress', updated_at = datetime('now') WHERE id = ?").run(taskId);

    const logId = crypto.randomUUID();
    db.prepare(`
      INSERT INTO task_logs (id, task_id, agent_id, message, created_at)
      VALUES (?, ?, ?, '✅ Задача принята в работу', datetime('now'))
    `).run(logId, taskId, agentId);

    db.close();
    return NextResponse.json({ ok: true, status: "in_progress" });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
