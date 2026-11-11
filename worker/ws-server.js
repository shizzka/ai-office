#!/usr/bin/env node
/**
 * Mission Control WebSocket Server
 * Broadcasts real-time events to connected clients.
 * 
 * Port 3101, proxied via Traefik at wss://factory.galson.pro/ws
 */

const { WebSocketServer, WebSocket } = require("ws");
const Database = require("better-sqlite3");
const path = require("path");
const http = require("http");
const { createOfficeEngine } = require('./office-engine');

function createOfficeServer(options = {}) {
const logger = options.quiet || process.env.OFFICE_WS_QUIET === '1'
  ? {log() {}, error() {}}
  : (options.logger || console);
const PORT = options.port ?? Number(process.env.PORT || 3101);
const DB_PATH = options.databasePath || path.resolve(process.cwd(), process.env.DATABASE_URL || path.join(__dirname, "../data/database.sqlite"));
const office = createOfficeEngine({...options.office,databasePath:DB_PATH});
const VISIBLE_TASKS = "t.archived = 0 AND NOT EXISTS (SELECT 1 FROM agents a WHERE a.id = t.assigned_to AND a.archived = 1) AND NOT EXISTS (SELECT 1 FROM projects p WHERE p.id = t.project_id AND p.archived = 1)";
const ACTIVE_AGENTS = `SELECT a.*, (SELECT h.status_text FROM agent_status_history h WHERE h.agent_id = a.id ORDER BY h.started_at DESC, h.rowid DESC LIMIT 1) AS status_text FROM agents a WHERE a.archived = 0`;
const POLL_DB_INTERVAL = 3000; // check DB for changes every 3s

// Track last known state
let lastTaskHash = "";
let lastLogCount = 0;
let lastAgentHash = "";

const server = http.createServer((req, res) => {
  // Health check
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, clients: wss.clients.size }));
    return;
  }
  // REST endpoint to push events from API/worker
  if (req.method === "POST" && req.url === "/emit") {
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", () => {
      try {
        const event = JSON.parse(body);
        // Office snapshots, scene starts, and completions are server-owned.
        if (!event || typeof event.type !== 'string' || /^office(?::|$)/i.test(event.type)) {
          res.writeHead(403, {'Content-Type':'application/json'});
          res.end('{"error":"office events are server-owned"}');
          return;
        }
        broadcast(event);
        res.writeHead(200);
        res.end('{"ok":true}');
      } catch {
        res.writeHead(400);
        res.end('{"error":"invalid json"}');
      }
    });
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server, path: "/mcws" });

// Allowed origins (set via ALLOWED_ORIGINS env or allow all in dev)
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(",") 
  : null; // null = allow all (dev mode)

wss.on("connection", (ws, req) => {
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  
  // Origin check
  const origin = req.headers.origin || "";
  if (ALLOWED_ORIGINS && !ALLOWED_ORIGINS.some(o => origin.startsWith(o))) {
    logger.log(`🚫 Rejected connection from ${origin} (${ip})`);
    ws.close(4003, "Origin not allowed");
    return;
  }
  
  logger.log(`🔌 Client connected (${ip}), total: ${wss.clients.size}`);
  ws.officeStream = new URL(req.url, 'http://localhost').searchParams.get('stream') === '1';
  ws.send(JSON.stringify(office.snapshot(ws.officeStream)));

  // Send initial state
  if (options.legacy !== false) try {
    const db = new Database(DB_PATH, { readonly: true });
    const tasks = db.prepare(`SELECT t.* FROM tasks t WHERE ${VISIBLE_TASKS} ORDER BY t.created_at DESC`).all();
    const agents = db.prepare(ACTIVE_AGENTS).all();
    db.close();
    
    ws.send(JSON.stringify({ type: "init", tasks, agents }));
  } catch (e) {
    logger.error("Init error:", e.message);
  }

  ws.on("close", () => {
    logger.log(`🔌 Client disconnected, total: ${wss.clients.size}`);
  });

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString());
      // Client can send task:sendMessage
      if (msg.type === "task:sendMessage" && msg.taskId && msg.message) {
        handleTaskMessage(msg);
      }
    } catch { /* ignore */ }
  });
});

function broadcast(event) {
  const data = JSON.stringify(event);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

async function handleTaskMessage(msg) {
  // Save comment and broadcast
  const crypto = require("crypto");
  const db = new Database(DB_PATH, { readonly: false });
  
  const commentId = crypto.randomUUID();
  db.prepare(`
    INSERT INTO task_comments (id, task_id, author_type, author_id, body, created_at)
    VALUES (?, ?, 'user', 'max', ?, datetime('now'))
  `).run(commentId, msg.taskId, msg.message);
  db.close();

  broadcast({
    type: "task:comment",
    taskId: msg.taskId,
    comment: {
      id: commentId,
      authorType: "user",
      authorId: "max",
      body: msg.message,
      createdAt: new Date().toISOString(),
    },
  });
}

// Poll DB for changes and broadcast
function pollForChanges() {
  if (wss.clients.size === 0) return; // no clients, skip

  try {
    const db = new Database(DB_PATH, { readonly: true });

    const agentHash = JSON.stringify(db.prepare(ACTIVE_AGENTS).all());
    if (agentHash !== lastAgentHash) {
      lastAgentHash = agentHash;
      broadcast({ type: "agents:refresh" });
    }

    // Check tasks hash
    const tasks = db.prepare(`SELECT t.* FROM tasks t WHERE ${VISIBLE_TASKS} ORDER BY t.id`).all();
    const hash = JSON.stringify(tasks);
    if (hash !== lastTaskHash) {
      lastTaskHash = hash;
      const fullTasks = db.prepare(`SELECT t.* FROM tasks t WHERE ${VISIBLE_TASKS} ORDER BY t.created_at DESC`).all();
      broadcast({ type: "tasks:sync", tasks: fullTasks });
    }

    // Check for new logs
    const logCount = db.prepare("SELECT COUNT(*) as c FROM task_logs").get();
    const commentCount = db.prepare("SELECT COUNT(*) as c FROM task_comments").get();
    const totalLogs = (logCount?.c || 0) + (commentCount?.c || 0);
    
    if (totalLogs !== lastLogCount) {
      // Get recent entries
      const recentLogs = db.prepare(`
        SELECT l.id, l.task_id, l.agent_id, l.message, l.created_at, 'log' as type FROM task_logs l
        JOIN tasks t ON t.id = l.task_id
        WHERE ${VISIBLE_TASKS} AND NOT EXISTS (SELECT 1 FROM agents a WHERE a.id = l.agent_id AND a.archived = 1)
        ORDER BY l.created_at DESC LIMIT 5
      `).all();
      const recentComments = db.prepare(`
        SELECT c.id, c.task_id, c.author_type, c.author_id, c.body as message, c.created_at, 'comment' as type FROM task_comments c
        JOIN tasks t ON t.id = c.task_id
        WHERE ${VISIBLE_TASKS} AND NOT EXISTS (SELECT 1 FROM agents a WHERE c.author_type = 'agent' AND a.id = c.author_id AND a.archived = 1)
        ORDER BY c.created_at DESC LIMIT 5
      `).all();

      broadcast({ 
        type: "logs:update", 
        entries: [...recentLogs, ...recentComments].sort((a, b) => 
          (b.created_at || "").localeCompare(a.created_at || "")
        ).slice(0, 10),
      });
      lastLogCount = totalLogs;
    }

    db.close();
  } catch (e) {
    logger.error("Poll error:", e.message);
  }
}

const pollTimer = options.legacy === false ? null : setInterval(pollForChanges, POLL_DB_INTERVAL);
function publishOffice() {
  office.tick();
  for (const client of wss.clients) if (client.readyState === WebSocket.OPEN) {
    client.send(JSON.stringify(office.snapshot(client.officeStream)));
  }
}
const officeTimer = setInterval(publishOffice, options.officeIntervalMs || 1000);
office.tick();
return {
  server,wss,office,
  listen: () => new Promise(resolve => server.listen(PORT, options.host || '0.0.0.0', () => resolve(server.address()))),
  close: () => new Promise(resolve => {
    clearInterval(pollTimer);clearInterval(officeTimer);
    for (const client of wss.clients) client.terminate();
    wss.close();server.close(() => {office.close();resolve();});
  }),
};
}
module.exports = {createOfficeServer};
if (require.main === module) {
  const instance=createOfficeServer();
  instance.listen().then(address=>{
    if(process.env.OFFICE_WS_QUIET !== '1') console.log(`🌐 WebSocket server running on port ${address.port}`);
  });
  for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>instance.close().then(()=>process.exit(0)));
}
