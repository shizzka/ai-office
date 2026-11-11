import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";

interface AgentTelegram { accountId: string; chatId: string }

const AGENT_TELEGRAM: Record<string, AgentTelegram> = {
  vanya: { accountId: "main", chatId: "-1003867136443" },
  tema: { accountId: "designer", chatId: "-1003794703032" },
  pushkin: { accountId: "copywriter", chatId: "-1003779845699" },
  volodya: { accountId: "tech", chatId: "-1003633771956" },
  garik: { accountId: "marketer", chatId: "-1003802652485" },
  stoyanov: { accountId: "urolog", chatId: "-1003695699164" },
  angelina: { accountId: "vanyalife", chatId: "-1003790381451" },
};

function getBotToken(accountId: string): string | null {
  try {
    const raw = readFileSync(join(process.env.HOME || "/root", ".openclaw", "openclaw.json"), "utf-8");
    const config = JSON.parse(raw);
    // Try per-account token first, fallback to global bot token
    return config.channels?.telegram?.accounts?.[accountId]?.botToken
      || config.channels?.telegram?.botToken
      || null;
  } catch {
    return null;
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { message } = await request.json();

    if (!message?.trim()) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    const agentTg = AGENT_TELEGRAM[id];
    if (!agentTg) {
      return NextResponse.json({ error: `Unknown agent: ${id}` }, { status: 404 });
    }

    const botToken = getBotToken(agentTg.accountId);
    if (!botToken) {
      return NextResponse.json({ error: "Cannot read bot token" }, { status: 500 });
    }

    const resp = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: agentTg.chatId,
        text: message,
      }),
    });

    const result = await resp.json();
    if (!result.ok) {
      return NextResponse.json({ error: `Telegram: ${result.description}` }, { status: 502 });
    }

    return NextResponse.json({ ok: true, messageId: result.result?.message_id });
  } catch (err) {
    return NextResponse.json({ error: "Failed to send", detail: String(err) }, { status: 500 });
  }
}
