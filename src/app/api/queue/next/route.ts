import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";

const DB_PATH = process.cwd() + "/data/database.sqlite";

// Agent polls for next task
export async function GET(request: NextRequest) {
  try {
    const agentKey = request.headers.get("x-agent-key");
    if (!agentKey) {
      return NextResponse.json({ error: "X-Agent-Key header required" }, { status: 401 });
    }

    const db = new Database(DB_PATH, { readonly: false });

    // Verify agent
    const agent = db.prepare("SELECT r.id FROM agent_registry r JOIN agents a ON a.id = r.id AND a.archived = 0 WHERE r.api_key = ? AND r.status = 'active'").get(agentKey) as { id: string } | undefined;
    if (!agent) {
      db.close();
      return NextResponse.json({ error: "Invalid or inactive agent" }, { status: 401 });
    }

    // Get next pending task assigned to this agent (or unassigned)
    const task = db.prepare(`
      SELECT t.id, t.title, t.description, t.priority, t.status, t.due_date,
             t.assigned_to, t.created_at
      FROM tasks t
      WHERE t.archived = 0
        AND NOT EXISTS (SELECT 1 FROM projects p WHERE p.id = t.project_id AND p.archived = 1)
        AND t.status IN ('assigned', 'todo')
        AND (t.assigned_to = ? OR t.assigned_to IS NULL)
      ORDER BY 
        CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
        t.created_at ASC
      LIMIT 1
    `).get(agent.id) as Record<string, string> | undefined;

    db.close();

    if (!task) {
      return NextResponse.json({ task: null, message: "No tasks in queue" });
    }

    return NextResponse.json({ task });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
