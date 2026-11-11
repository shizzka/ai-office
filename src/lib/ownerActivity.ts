import { readdir, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const OWNER_ACTIVE_MS = 120_000;
const project = /(?:^|[\/\s"'-])(?:dcm(?:-[\w-]+)?|job-hunter|jh(?:-[\w-]+)?)(?=$|[\/\s"'])/i;
const projectReference = /(?:\/|\bwork\/)(?:dcm(?:-[\w-]+)?|job-hunter|jh(?:-[\w-]+)?)(?=$|[\/\s"'])/i;
const files = new Map<string, { mtime: number; size: number; latest: number }>();
/** Tool results also have role=user in Claude transcripts: they are not human input. */
export function ownerUserTimestamp(record: unknown): number | null {
  if (!record || typeof record !== 'object') return null;
  const row = record as { isMeta?: boolean; isCompactSummary?: boolean; timestamp?: string; message?: { role?: string; content?: unknown } };
  if (row.isMeta || row.isCompactSummary || row.message?.role !== 'user') return null;
  const content = row.message.content;
  if (typeof content !== 'string' && !(Array.isArray(content) && content.some(b => b?.type === 'text') && !content.some(b => b?.type === 'tool_result'))) return null;
  const time = Date.parse(row.timestamp || '');
  return Number.isFinite(time) ? time : null;
}
async function* transcripts(root: string): AsyncGenerator<string> {
  let entries;
  try { entries = await readdir(root, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) yield* transcripts(path);
    else if (entry.isFile() && entry.name.endsWith('.jsonl')) yield path;
  }
}
/** Only timestamps and project membership leave the reader; transcript text stays local. */
export async function latestOwnerInput(root = join(homedir(), '.claude/projects'), now = Date.now()): Promise<number> {
  let latest = 0;
  for await (const path of transcripts(root)) {
    try {
      const info = await stat(path);
      if (info.mtimeMs < now - OWNER_ACTIVE_MS) continue;
      const cached = files.get(path);
      if (cached?.mtime === info.mtimeMs && cached.size === info.size) { latest = Math.max(latest, cached.latest); continue; }
      let relevant = project.test(path), input = 0;
      const lines = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
      for await (const line of lines) {
        try {
          const row = JSON.parse(line);
          relevant ||= project.test(String(row.cwd || '')) || projectReference.test(JSON.stringify(row.message?.content || ''));
          const time = ownerUserTimestamp(row);
          if (time !== null && time <= now) input = Math.max(input, time);
        } catch { /* tolerate a concurrent partial append */ }
      }
      const value = relevant ? input : 0;
      files.set(path, { mtime: info.mtimeMs, size: info.size, latest: value });
      latest = Math.max(latest, value);
    } catch { /* missing, rotating, or unreadable transcript: no positive signal */ }
  }
  return latest;
}
export function ownerStatus(latest: number, now = Date.now()) {
  const active = latest > 0 && now >= latest && now - latest < OWNER_ACTIVE_MS;
  return { currentStatus: active ? 'working' as const : 'idle' as const, statusText: active ? 'работает · DCM / JH' : 'на объекте' };
}
