import { NextRequest, NextResponse } from "next/server";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

// Map dashboard agent IDs to OpenClaw agent directory names
const AGENT_MAP: Record<string, string> = {
  vanya: "main",
  tema: "designer",
  pushkin: "copywriter",
  volodya: "tech",
  garik: "marketer",
  stoyanov: "urolog",
  ded: "tech", // Дед пока не агент, fallback
  angelina: "vanyalife",
};

const SESSIONS_BASE = join(process.env.HOME || "/root", ".openclaw", "agents");

interface LogMessage {
  role: "user" | "assistant" | "system" | "tool";
  text: string;
  timestamp: string;
  toolName?: string;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get("limit") || "50");
    const sessionIndex = parseInt(url.searchParams.get("session") || "0"); // 0 = latest

    const agentDir = AGENT_MAP[id];
    if (!agentDir) {
      return NextResponse.json({ error: "Unknown agent" }, { status: 404 });
    }

    const sessionsDir = join(SESSIONS_BASE, agentDir, "sessions");

    let files: string[];
    try {
      files = readdirSync(sessionsDir)
        .filter((f) => f.endsWith(".jsonl"))
        .sort((a, b) => {
          const sa = statSync(join(sessionsDir, a)).mtimeMs;
          const sb = statSync(join(sessionsDir, b)).mtimeMs;
          return sb - sa; // newest first
        });
    } catch {
      return NextResponse.json({ sessions: [], messages: [], total: 0 });
    }

    if (files.length === 0) {
      return NextResponse.json({ sessions: [], messages: [], total: 0 });
    }

    // Session list (metadata only)
    const sessionList = files.slice(0, 20).map((f, i) => ({
      index: i,
      filename: f,
      id: f.replace(".jsonl", ""),
      modified: statSync(join(sessionsDir, f)).mtime.toISOString(),
    }));

    // Read selected session
    const targetFile = files[Math.min(sessionIndex, files.length - 1)];
    const raw = readFileSync(join(sessionsDir, targetFile), "utf-8");
    const lines = raw.trim().split("\n");

    const messages: LogMessage[] = [];

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.type !== "message" || !entry.message) continue;

        const msg = entry.message;
        const role = msg.role;
        const ts = entry.timestamp || msg.timestamp || "";

        if (role === "user") {
          // User message
          const content = msg.content;
          let text = "";
          if (typeof content === "string") {
            text = content;
          } else if (Array.isArray(content)) {
            text = content
              .filter((c: { type: string; text?: string }) => c.type === "text")
              .map((c: { text: string }) => c.text)
              .join("\n");
          }
          if (text) {
            // Strip system envelope noise and OpenClaw metadata
            let cleaned = text
              .replace(/^\[System Message\].*?\n/gm, "")
              .replace(/^Conversation info \(untrusted metadata\):[\s\S]*?```\n\n?/gm, "")
              .replace(/^Sender \(untrusted metadata\):[\s\S]*?```\n\n?/gm, "")
              .replace(/^\[Audio\] User text:.*?\] /gm, "")
              .replace(/^<media:audio> Transcript: /gm, "")
              .replace(/^.*?\(\d+\):\s*(?:<media:audio> Transcript: )?/gm, "")
              .trim();
            // Extract actual user text after metadata blocks
            const lastJsonBlock = cleaned.lastIndexOf("```\n");
            if (lastJsonBlock > 0 && cleaned.substring(0, 30).includes("{")) {
              cleaned = cleaned.substring(lastJsonBlock + 4).trim();
            }
            if (cleaned) messages.push({ role: "user", text: cleaned, timestamp: ts });
          }
        } else if (role === "assistant") {
          const content = msg.content;
          if (typeof content === "string") {
            messages.push({ role: "assistant", text: content, timestamp: ts });
          } else if (Array.isArray(content)) {
            const textParts = content
              .filter((c: { type: string }) => c.type === "text")
              .map((c: { text: string }) => c.text)
              .join("\n");
            const toolCalls = content
              .filter((c: { type: string }) => c.type === "toolCall")
              .map((c: { name: string }) => c.name);

            if (textParts) {
              messages.push({ role: "assistant", text: textParts, timestamp: ts });
            }
            for (const tool of toolCalls) {
              messages.push({ role: "tool", text: `→ ${tool}`, timestamp: ts, toolName: tool });
            }
          }
        } else if (role === "toolResult") {
          // Skip tool results for cleaner log (too noisy)
        }
      } catch {
        // skip malformed lines
      }
    }

    // Return last N messages
    const sliced = messages.slice(-limit);

    return NextResponse.json({
      sessions: sessionList,
      messages: sliced,
      total: messages.length,
      sessionId: targetFile.replace(".jsonl", ""),
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to read log", detail: String(err) },
      { status: 500 }
    );
  }
}
