#!/bin/bash
set -e

echo "🏢 AI Office Constructor — Setup"
echo "================================="
echo ""

# Check dependencies
for cmd in node npm ssh sqlite3; do
  if ! command -v $cmd &>/dev/null; then
    echo "❌ $cmd не найден. Установи: https://nodejs.org"
    exit 1
  fi
done
echo "✅ Зависимости ок"

CONFIG_DIR="$(dirname "$0")/../config"
CONFIG="$CONFIG_DIR/office.json"

if [ -f "$CONFIG" ]; then
  echo "⚠️  config/office.json уже существует. Перезаписать? (y/n)"
  read -r answer
  [ "$answer" != "y" ] && echo "Отменено." && exit 0
fi

# Office name
echo ""
read -p "📋 Название офиса (My AI Office): " OFFICE_NAME
OFFICE_NAME=${OFFICE_NAME:-"My AI Office"}

# Agents
echo ""
echo "👥 Настройка агентов"
echo "   Для каждого агента укажи: ID (латиницей), Имя, Эмодзи, Роль"
echo "   Пустой ID = закончить"
echo ""

AGENTS="["
MAPPING="{"
COUNT=0

while true; do
  COUNT=$((COUNT + 1))
  echo "--- Агент #$COUNT ---"
  read -p "  ID (латиницей, пустой = стоп): " AGENT_ID
  [ -z "$AGENT_ID" ] && break
  
  read -p "  Имя: " AGENT_NAME
  read -p "  Эмодзи (одна): " AGENT_EMOJI
  read -p "  Роль: " AGENT_ROLE
  read -p "  OpenClaw agent ID (main/copywriter/tech/...): " CLAW_ID
  
  PX=$(( 150 + (COUNT - 1) * 150 ))
  PY=$(( 280 + (RANDOM % 60) ))
  
  [ $COUNT -gt 1 ] && AGENTS="$AGENTS,"
  AGENTS="$AGENTS
    {\"id\":\"$AGENT_ID\",\"name\":\"$AGENT_NAME\",\"emoji\":\"$AGENT_EMOJI\",\"role\":\"$AGENT_ROLE\",\"description\":\"\",\"position\":{\"x\":$PX,\"y\":$PY}}"
  
  if [ -n "$CLAW_ID" ]; then
    [ "$MAPPING" != "{" ] && MAPPING="$MAPPING,"
    MAPPING="$MAPPING\"$CLAW_ID\":\"$AGENT_ID\""
  fi
  echo ""
done

AGENTS="$AGENTS
  ]"
MAPPING="$MAPPING}"

# VPS
echo ""
echo "🖥️  Настройка VPS"
read -p "  SSH host (user@ip или alias из ~/.ssh/config): " VPS_HOST
VPS_HOST=${VPS_HOST:-"root@your-vps"}
read -p "  Домен (office.example.com): " DOMAIN
DOMAIN=${DOMAIN:-"office.example.com"}

# Extract user and host
VPS_USER=$(echo "$VPS_HOST" | cut -d@ -f1)
VPS_ADDR=$(echo "$VPS_HOST" | cut -d@ -f2)
[ "$VPS_USER" = "$VPS_ADDR" ] && VPS_USER="root"

# Write config
cat > "$CONFIG" << CONFIGEOF
{
  "officeName": "$OFFICE_NAME",
  "domain": "$DOMAIN",
  "agents": $AGENTS,
  "openclaw": {
    "sessionsBase": "~/.openclaw/agents",
    "agentMapping": $MAPPING
  },
  "sync": {
    "idleThresholdMin": 5,
    "offlineThresholdMin": 30,
    "intervalSec": 120
  },
  "deploy": {
    "method": "ssh",
    "host": "$VPS_ADDR",
    "user": "$VPS_USER",
    "remotePath": "/opt/ai-office",
    "ports": {
      "app": 3100,
      "websocket": 3101
    }
  }
}
CONFIGEOF

echo ""
echo "✅ Конфиг создан: config/office.json"
echo ""

# Init database
echo "📦 Создаю базу данных..."
DB_PATH="$(dirname "$0")/../data/database.sqlite"
mkdir -p "$(dirname "$DB_PATH")"

sqlite3 "$DB_PATH" << 'DBEOF'
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  emoji TEXT NOT NULL,
  role TEXT NOT NULL,
  description TEXT,
  position_x INTEGER DEFAULT 0,
  position_y INTEGER DEFAULT 0,
  current_status TEXT DEFAULT 'offline',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS agent_status_history (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  status TEXT NOT NULL,
  status_text TEXT,
  started_at TEXT DEFAULT CURRENT_TIMESTAMP,
  ended_at TEXT,
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS activity_logs (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  details TEXT,
  user_id TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'backlog',
  priority TEXT DEFAULT 'medium',
  assigned_to TEXT,
  created_by TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (assigned_to) REFERENCES agents(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_status_history_agent ON agent_status_history(agent_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_entity ON activity_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON activity_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON tasks(assigned_to);
DBEOF

# Insert agents from config
node -e "
const cfg = require('$CONFIG');
const Database = require('better-sqlite3');
const db = new Database('$DB_PATH');
const stmt = db.prepare('INSERT OR REPLACE INTO agents (id,name,emoji,role,description,position_x,position_y,current_status) VALUES (?,?,?,?,?,?,?,\"offline\")');
for (const a of cfg.agents) {
  stmt.run(a.id, a.name, a.emoji, a.role, a.description || '', a.position?.x || 0, a.position?.y || 0);
}
db.close();
console.log('Inserted ' + cfg.agents.length + ' agents');
" 2>/dev/null || {
  # Fallback without better-sqlite3
  for row in $(node -e "const c=require('$CONFIG');c.agents.forEach(a=>console.log(a.id+'|'+a.name+'|'+a.emoji+'|'+a.role+'|'+(a.description||'')+'|'+(a.position?.x||0)+'|'+(a.position?.y||0)))"); do
    IFS='|' read -r id name emoji role desc px py <<< "$row"
    sqlite3 "$DB_PATH" "INSERT OR REPLACE INTO agents (id,name,emoji,role,description,position_x,position_y,current_status) VALUES ('$id','$name','$emoji','$role','$desc',$px,$py,'offline');"
  done
}

echo "✅ База данных создана: data/database.sqlite"
echo ""

# Create admin user
echo ""
echo "🔐 Настройка admin пользователя"
read -p "  Логин (admin): " ADMIN_USER
ADMIN_USER=${ADMIN_USER:-"admin"}
read -s -p "  Пароль: " ADMIN_PASS
echo ""
if [ -z "$ADMIN_PASS" ]; then
  ADMIN_PASS=$(openssl rand -hex 8)
  echo "  Сгенерирован пароль: $ADMIN_PASS"
fi

# Hash password and insert
HASH=$(node -e "const b=require('bcryptjs');console.log(b.hashSync('$ADMIN_PASS',10))" 2>/dev/null)
if [ -n "$HASH" ]; then
  ID=$(node -e "console.log(require('crypto').randomUUID())")
  sqlite3 "$DB_PATH" "INSERT OR REPLACE INTO users (id, username, password_hash, role) VALUES ('$ID', '$ADMIN_USER', '$HASH', 'admin');"
  echo "✅ Admin пользователь создан: $ADMIN_USER"
else
  echo "⚠️  bcryptjs не найден, установи зависимости: npm install"
  echo "   Потом создай юзера: node -e "...""
fi

# Generate JWT secret
JWT_SECRET=$(openssl rand -hex 32)
echo "JWT_SECRET=$JWT_SECRET" > "$(dirname "$0")/../.env"
echo "✅ JWT secret сгенерирован в .env"

echo "🎉 Setup завершён!"
echo ""
echo "Следующие шаги:"
echo "  1. Проверь config/office.json"
echo "  2. npm install"
echo "  3. bash scripts/deploy.sh"
echo "  4. Настрой sync: node scripts/sync-agents.js"
echo ""
echo "Документация: README.md"
