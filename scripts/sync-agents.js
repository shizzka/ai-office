#!/usr/bin/env node
/**
 * AI Office — Agent Status Sync
 * Reads OpenClaw session files, determines agent statuses, pushes to VPS.
 * Config-driven — no hardcoded agent names.
 */
const { execSync } = require("child_process");
const { readdirSync, statSync, readFileSync, existsSync } = require("fs");
const { join, resolve } = require("path");

// Load config
const CONFIG_PATH = process.env.OFFICE_CONFIG || join(__dirname, "../config/office.json");
if (!existsSync(CONFIG_PATH)) {
  console.error(`Config not found: ${CONFIG_PATH}`);
  console.error("Run: cp config/office.example.json config/office.json");
  process.exit(1);
}
const config = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));

const SESSIONS_BASE = config.openclaw.sessionsBase.replace("~", process.env.HOME);
const VPS_DB = join(config.deploy.remotePath, "data/database.sqlite");
const VPS_HOST = config.deploy.host || config.deploy.user + "@" + config.deploy.host;
const SSH_TARGET = config.deploy.user ? `${config.deploy.user}@${config.deploy.host}` : config.deploy.host;

const IDLE_MS = (config.sync?.idleThresholdMin || 5) * 60 * 1000;
const OFFLINE_MS = (config.sync?.offlineThresholdMin || 30) * 60 * 1000;

const SKIP_PATTERNS = [
  /NO_REPLY/i, /HEARTBEAT/i, /ANNOUNCE_SKIP/i,
  /memory_search/i, /session_status/i, /config\.get/i,
];

function getAgentStatuses() {
  const now = Date.now();
  const mapping = config.openclaw.agentMapping;
  const statuses = {};

  for (const [clawId, officeId] of Object.entries(mapping)) {
    const agentDir = join(SESSIONS_BASE, clawId, "sessions");
    let latestMtime = 0;
    let latestText = "";

    try {
      const files = readdirSync(agentDir).filter(f => f.endsWith(".jsonl"));
      for (const file of files) {
        const fpath = join(agentDir, file);
        const mtime = statSync(fpath).mtimeMs;
        if (mtime > latestMtime) {
          latestMtime = mtime;
          try {
            const lines = readFileSync(fpath, "utf8").trim().split("\n");
            const last = JSON.parse(lines[lines.length - 1]);
            let text = "";
            if (typeof last.content === "string") text = last.content;
            else if (Array.isArray(last.content)) {
              const t = last.content.find(c => c.type === "text");
              if (t) text = t.text;
            }
            if (text && !SKIP_PATTERNS.some(p => p.test(text))) {
              latestText = text.substring(0, 100).replace(/['"\\]/g, "").replace(/\n/g, " ");
            }
          } catch {}
        }
      }
    } catch {}

    const age = now - latestMtime;
    let status = "offline";
    if (latestMtime > 0 && age < IDLE_MS) status = "working";
    else if (latestMtime > 0 && age < OFFLINE_MS) status = "idle";

    statuses[officeId] = { status, statusText: latestText };
  }
  return statuses;
}

function pushToVPS(statuses) {
  const sql = Object.entries(statuses)
    .map(([id, d]) => `UPDATE agents SET current_status='${d.status}' WHERE id='${id}';`)
    .join("\n");

  try {
    execSync(`ssh ${SSH_TARGET} "sqlite3 '${VPS_DB}'" << 'EOSQL'\n${sql}\nEOSQL`, {
      timeout: 15000, stdio: "pipe"
    });
  } catch (e) {
    console.error("Push failed:", e.stderr?.toString()?.substring(0, 200) || e.message);
  }
}

function notifyWs() {
  const wsPort = config.deploy.ports?.websocket || 3101;
  try {
    execSync(
      `ssh ${SSH_TARGET} "curl -s -X POST http://localhost:${wsPort}/emit -H 'Content-Type: application/json' -d '{\\\"type\\\":\\\"agents:refresh\\\"}'"`,
      { timeout: 10000, stdio: "pipe" }
    );
  } catch {}
}

// Main
const statuses = getAgentStatuses();
const active = Object.entries(statuses).filter(([, d]) => d.status !== "offline");
const offline = Object.keys(statuses).length - active.length;
console.log(`[${new Date().toLocaleTimeString()}] ${active.length} active, ${offline} offline`);
if (active.length) console.log(`  ${active.map(([id, d]) => `${id}(${d.status})`).join(", ")}`);

pushToVPS(statuses);
notifyWs();
console.log("Done.");
