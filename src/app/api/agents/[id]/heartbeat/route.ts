import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";

const DB_PATH = process.cwd() + "/data/database.sqlite";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const agentKey = request.headers.get("x-agent-key");
    
    const db = new Database(DB_PATH, { readonly: false });
    
    const agent = db.prepare("SELECT id FROM agent_registry WHERE id = ? AND api_key = ?").get(id, agentKey);
    if (!agent) {
      db.close();
      return NextResponse.json({ error: "Invalid agent or key" }, { status: 401 });
    }

    db.prepare("UPDATE agent_registry SET last_heartbeat = datetime('now'), status = 'active' WHERE id = ?").run(id);
    db.close();

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
