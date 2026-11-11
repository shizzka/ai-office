import type { Bot } from "grammy";
import { getRecentFeed, getNewFeedSince } from "./db";

function formatLogEntry(log: {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  details: string | null;
  createdAt: string | null;
}): string {
  const time = log.createdAt ? new Date(log.createdAt).toLocaleTimeString("ru-RU") : "?";
  const entity = `${log.entityType}/${log.entityId.slice(0, 8)}`;
  let details = "";
  if (log.details) {
    try {
      const parsed = JSON.parse(log.details);
      if (parsed.from && parsed.to) {
        details = ` (${parsed.from} → ${parsed.to})`;
      } else {
        const str = JSON.stringify(parsed);
        details = str.length < 60 ? ` ${str}` : "";
      }
    } catch {
      details = ` ${log.details.slice(0, 60)}`;
    }
  }
  return `[${time}] ${log.action} on ${entity}${details}`;
}

export function startNotifier(bot: Bot, chatId: string) {
  let lastSeenId: string | null = null;

  // Initialize lastSeenId with the current latest entry (don't notify on startup)
  getRecentFeed(1).then((entries) => {
    if (entries.length > 0) {
      lastSeenId = entries[0].id;
    }
  });

  setInterval(async () => {
    try {
      const newEntries = await getNewFeedSince(lastSeenId);
      if (newEntries.length === 0) return;

      const lines = newEntries.map(formatLogEntry);
      const text = `📡 <b>Новые события</b> (${newEntries.length}):\n\n${lines.map((l) => `• ${l}`).join("\n")}`;

      await bot.api.sendMessage(chatId, text, { parse_mode: "HTML" });

      lastSeenId = newEntries[newEntries.length - 1].id;
    } catch (err) {
      console.error("[notifier] error:", err);
    }
  }, 30_000);
}
