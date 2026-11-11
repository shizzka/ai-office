import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import crypto from "crypto";

const DB_PATH = process.cwd() + "/data/database.sqlite";

// GET — list all chains
export async function GET() {
  try {
    const db = new Database(DB_PATH, { readonly: true });
    const chains = db.prepare("SELECT * FROM task_chains ORDER BY created_at DESC").all();
    db.close();
    return NextResponse.json({ chains: chains.map((c: any) => ({ ...c, steps: JSON.parse((c as { steps: string }).steps) })) });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// POST — create a chain
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, description, steps } = body;

    if (!name || !steps || !Array.isArray(steps) || steps.length < 2) {
      return NextResponse.json({ error: "name and steps (array, min 2) required" }, { status: 400 });
    }

    const db = new Database(DB_PATH, { readonly: false });
    const id = crypto.randomUUID();

    db.prepare(`
      INSERT INTO task_chains (id, name, description, steps, created_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `).run(id, name, description || null, JSON.stringify(steps));

    db.close();
    return NextResponse.json({ ok: true, chain: { id, name, steps } }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
