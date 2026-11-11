#!/bin/bash
set -e

echo "🚀 AI Office — Deploy to VPS"
echo "============================="

CONFIG="$(dirname "$0")/../config/office.json"
if [ ! -f "$CONFIG" ]; then
  echo "❌ config/office.json не найден. Сначала запусти: bash scripts/setup.sh"
  exit 1
fi

# Parse config
VPS_USER=$(node -e "const c=require('$CONFIG');console.log(c.deploy.user||'root')")
VPS_HOST=$(node -e "const c=require('$CONFIG');console.log(c.deploy.host)")
REMOTE=$(node -e "const c=require('$CONFIG');console.log(c.deploy.remotePath||'/opt/ai-office')")
APP_PORT=$(node -e "const c=require('$CONFIG');console.log(c.deploy.ports?.app||3100)")
WS_PORT=$(node -e "const c=require('$CONFIG');console.log(c.deploy.ports?.websocket||3101)")
DOMAIN=$(node -e "const c=require('$CONFIG');console.log(c.domain||'office.example.com')")
SSH="$VPS_USER@$VPS_HOST"

echo "📡 Target: $SSH:$REMOTE"
echo "🌐 Domain: $DOMAIN"
echo ""

# Test SSH
echo "🔑 Проверяю SSH..."
ssh -o ConnectTimeout=5 "$SSH" "echo ok" || { echo "❌ SSH не работает. Проверь доступ: ssh $SSH"; exit 1; }
echo "✅ SSH ок"

# Create remote dir
ssh "$SSH" "mkdir -p $REMOTE/data"

# Sync files
echo "📦 Синхронизирую файлы..."
rsync -avz --delete \
  --exclude 'node_modules' \
  --exclude '.git' \
  --exclude '.next' \
  --exclude 'data/database.sqlite*' \
  "$(dirname "$0")/../" "$SSH:$REMOTE/"

# Copy database if not exists on VPS
ssh "$SSH" "[ -f $REMOTE/data/database.sqlite ] || echo 'NO_DB'" | grep -q "NO_DB" && {
  echo "📦 Копирую базу данных..."
  scp "$(dirname "$0")/../data/database.sqlite" "$SSH:$REMOTE/data/"
}

# Install deps on VPS
echo "📦 Устанавливаю зависимости..."
ssh "$SSH" "cd $REMOTE && npm install --production"

# Build locally (VPS often has limited RAM)
echo "🔨 Собираю локально..."
cd "$(dirname "$0")/.."
NODE_OPTIONS="--max-old-space-size=512" npx next build || { echo "❌ Build failed"; exit 1; }

echo "📦 Отправляю билд на VPS..."
rsync -avz --delete .next/ "$SSH:$REMOTE/.next/"

# Setup pm2
echo "⚙️  Настраиваю pm2..."
ssh "$SSH" "cd $REMOTE && pm2 delete ai-office ai-office-ws 2>/dev/null; \
  pm2 start npm --name ai-office -- start -- -p $APP_PORT && \
  pm2 start worker/ws-server.js --name ai-office-ws && \
  pm2 save"

# Setup nginx
echo "🌐 Настраиваю nginx..."
NGINX_CONF=$(cat << NGINXEOF
server {
    listen 80;
    server_name $DOMAIN;

    location / {
        proxy_pass http://127.0.0.1:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \\\$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \\\$host;
        proxy_set_header X-Real-IP \\\$remote_addr;
        proxy_cache_bypass \\\$http_upgrade;
    }

    location /ws {
        proxy_pass http://127.0.0.1:$WS_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \\\$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \\\$host;
        proxy_set_header X-Real-IP \\\$remote_addr;
    }
}
NGINXEOF
)

ssh "$SSH" "echo '$NGINX_CONF' > /etc/nginx/sites-available/ai-office && \
  ln -sf /etc/nginx/sites-available/ai-office /etc/nginx/sites-enabled/ && \
  nginx -t && systemctl reload nginx"

echo ""
echo "✅ Деплой завершён!"
echo ""
echo "🌐 http://$DOMAIN"
echo ""
echo "Для HTTPS: ssh $SSH 'certbot --nginx -d $DOMAIN'"
echo ""
echo "Автосинхронизация (на локальной машине):"
echo "  # Добавь в LaunchAgent или crontab:"
echo "  */2 * * * * cd $(dirname "$0")/.. && node scripts/sync-agents.js >> /tmp/ai-office-sync.log 2>&1"
