import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import crypto from "crypto";

const DB_PATH = process.cwd() + "/data/database.sqlite";

export async function POST(request: NextRequest) {
  // Require auth token for registration
  const token = request.headers.get("authorization")?.replace("Bearer ", "") ||
    request.cookies.get("ai-office-token")?.value;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await request.json();
    const { name, emoji, role, source, webhookUrl, openclawSession, capabilities } = body;

    if (!name || !source) {
      return NextResponse.json({ error: "name and source required" }, { status: 400 });
    }

    const validSources = ["openclaw-local", "openclaw-remote", "api", "webhook"];
    if (!validSources.includes(source)) {
      return NextResponse.json({ error: `source must be: ${validSources.join(", ")}` }, { status: 400 });
    }

    const db = new Database(DB_PATH, { readonly: false });
    
    const id = crypto.randomUUID();
    const apiKey = `mc_${crypto.randomBytes(32).toString("hex")}`;

    db.prepare(`
      INSERT INTO agent_registry (id, name, emoji, role, source, api_key, webhook_url, openclaw_session, capabilities, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(id, name, emoji || null, role || null, source, apiKey, webhookUrl || null, openclawSession || null, capabilities ? JSON.stringify(capabilities) : null);

    db.close();

    return NextResponse.json({
      ok: true,
      agent: { id, name, emoji, role, source, apiKey },
      message: "Agent registered. Use apiKey in X-Agent-Key header for all requests.",
    }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
