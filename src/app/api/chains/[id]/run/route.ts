import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import crypto from "crypto";

const DB_PATH = process.cwd() + "/data/database.sqlite";

// POST — run a chain (creates linked tasks)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: chainId } = await params;
    const body = await request.json();
    const { title, description, priority = "medium" } = body;

    const db = new Database(DB_PATH, { readonly: false });

    const chain = db.prepare("SELECT * FROM task_chains WHERE id = ?").get(chainId) as { id: string; name: string; steps: string } | undefined;
    if (!chain) {
      db.close();
      return NextResponse.json({ error: "Chain not found" }, { status: 404 });
    }

    const steps = JSON.parse(chain.steps);
    const taskIds: string[] = [];

    // Create tasks for each step
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const taskId = crypto.randomUUID();
      const stepTitle = `[${chain.name} ${i + 1}/${steps.length}] ${step.action || title}`;
      const status = i === 0 ? "assigned" : "planning"; // Only first task starts

      db.prepare(`
        INSERT INTO tasks (id, title, description, status, priority, assigned_to, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `).run(taskId, stepTitle, step.description || description || null, status, priority, step.agentId || null);

      // Link dependency (each step depends on previous)
      if (i > 0) {
        db.prepare(`
          INSERT OR IGNORE INTO task_dependencies (task_id, depends_on)
          VALUES (?, ?)
        `).run(taskId, taskIds[i - 1]);
      }

      // Log
      const logId = crypto.randomUUID();
      db.prepare(`
        INSERT INTO task_logs (id, task_id, agent_id, message, created_at)
        VALUES (?, ?, NULL, ?, datetime('now'))
      `).run(logId, taskId, `🔗 Цепочка "${chain.name}" — шаг ${i + 1}/${steps.length}`);

      taskIds.push(taskId);
    }

    db.close();
    return NextResponse.json({ ok: true, chainId, taskIds, stepsCount: steps.length });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
