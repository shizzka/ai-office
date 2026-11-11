export type PultLineId = "shield" | "smeta";
export type PultAction = "start" | "pause" | "approve" | "retry" | "check-workers";
export interface LinePresentation {
  doing: string;
  attention: { level: 'none' | 'decision' | 'intervention'; text: string; reason: string; action: string };
  timing: { key: string; startedAt: number | null; elapsedMinutes: number | null; expectedMinutes: number; typicalLabel: string; source: 'journal' | 'default'; samples: number };
  showSilence: boolean;
  expectedAt: number | null;
  queueActive: boolean;
}
export interface PultEvent {
  id: string; line: string; code: string | null; text: string; at: number;
  humanText?: string; raw?: string; eventType?: string;
}
export interface PultLine {
  id: PultLineId;
  name: string;
  status: "running" | "waiting" | "stopped" | "awaiting-start";
  circle: string | null;
  stage: string;
  reason: string;
  presentation?: LinePresentation;
  pauseRequested?: boolean;
  completed?: boolean;
  lastEventAt: number | null;
  idleSeconds: number;
  tmux: boolean;
  processes: { codex: boolean; worker: boolean; queue?: boolean };
  queue: { code: string; block: string; type: string; state: string; status: "queued" | "running" | "review" | "stopped" | "done" }[];
  review: string[];
  lastRegression: { code: string; result: "green" | "red" | "unknown"; text: string } | null;
}
export interface PultSnapshot {
  updatedAt: number;
  lines: PultLine[];
  events: PultEvent[];
  workers: { id: string; name: string; host: string; port: number; available: boolean; checkedAt: number; downSince: number | null }[];
}
