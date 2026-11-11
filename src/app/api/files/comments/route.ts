import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import { randomUUID } from "crypto";
import { join } from "path";

const DB_PATH = join(process.cwd(), "data/database.sqlite");

function getDb() {
  return new Database(DB_PATH);
}

// GET: list comments for a file
export async function GET(request: NextRequest) {
  const base = request.nextUrl.searchParams.get("base");
  const filePath = request.nextUrl.searchParams.get("path");

  if (!base || !filePath) {
    return NextResponse.json({ error: "Missing base or path" }, { status: 400 });
  }

  const db = getDb();
  try {
    const comments = db.prepare(
      "SELECT * FROM file_comments WHERE file_base = ? AND file_path = ? ORDER BY line_start ASC, created_at ASC"
    ).all(base, filePath);

    return NextResponse.json({ comments });
  } finally {
    db.close();
  }
}

// POST: create a comment
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { base, path: filePath, lineStart, lineEnd, paragraphHash, authorType, authorId, text, parentId } = body;

  if (!base || !filePath || !text || !authorId) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const db = getDb();
  try {
    const id = randomUUID();
    db.prepare(
      `INSERT INTO file_comments (id, file_base, file_path, line_start, line_end, paragraph_hash, author_type, author_id, body, parent_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, base, filePath, lineStart || null, lineEnd || null, paragraphHash || null, authorType || "user", authorId, text, parentId || null);

    const comment = db.prepare("SELECT * FROM file_comments WHERE id = ?").get(id);
    return NextResponse.json({ comment }, { status: 201 });
  } finally {
    db.close();
  }
}
