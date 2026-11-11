import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";

const DB_PATH = process.cwd() + "/data/database.sqlite";

export async function GET() {
  try {
    const db = new Database(DB_PATH, { readonly: true });
    const hasRegistry = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'agent_registry'").get();
    const agents = hasRegistry
      ? db.prepare(`
          SELECT r.id, r.name, r.emoji, r.role, r.source, r.status, r.capabilities, r.last_heartbeat, r.created_at
          FROM agent_registry r JOIN agents a ON a.id = r.id AND a.archived = 0
          ORDER BY r.created_at DESC
        `).all()
      : db.prepare("SELECT id, name, emoji, role, current_status AS status, created_at FROM agents WHERE archived = 0 ORDER BY created_at DESC").all();
    db.close();

    return NextResponse.json({ agents });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const db = new Database(DB_PATH, { readonly: false });
    db.prepare("DELETE FROM agent_registry WHERE id = ?").run(id);
    db.close();

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
