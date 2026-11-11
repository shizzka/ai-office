#!/bin/bash
# Install sync-agents as a LaunchAgent (macOS) or cron (Linux)
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SYNC_SCRIPT="$SCRIPT_DIR/sync-agents.js"
NODE=$(which node)
INTERVAL=120

if [ "$(uname)" = "Darwin" ]; then
  # macOS — LaunchAgent
  PLIST=~/Library/LaunchAgents/com.ai-office.sync.plist
  cat > "$PLIST" << PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.ai-office.sync</string>
  <key>ProgramArguments</key><array>
    <string>$NODE</string>
    <string>$SYNC_SCRIPT</string>
  </array>
  <key>WorkingDirectory</key><string>$SCRIPT_DIR/..</string>
  <key>StartInterval</key><integer>$INTERVAL</integer>
  <key>StandardOutPath</key><string>/tmp/ai-office-sync.log</string>
  <key>StandardErrorPath</key><string>/tmp/ai-office-sync-err.log</string>
  <key>EnvironmentVariables</key><dict>
    <key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
    <key>HOME</key><string>$HOME</string>
  </dict>
</dict>
</plist>
PLISTEOF
  launchctl unload "$PLIST" 2>/dev/null || true
  launchctl load "$PLIST"
  echo "✅ LaunchAgent установлен (каждые ${INTERVAL}с)"
  echo "   Лог: /tmp/ai-office-sync.log"
  echo "   Удалить: launchctl unload $PLIST && rm $PLIST"
else
  # Linux — crontab
  CRON_LINE="*/$((INTERVAL/60)) * * * * cd $SCRIPT_DIR/.. && $NODE $SYNC_SCRIPT >> /tmp/ai-office-sync.log 2>&1"
  (crontab -l 2>/dev/null | grep -v ai-office-sync; echo "$CRON_LINE") | crontab -
  echo "✅ Cron установлен (каждые $((INTERVAL/60)) мин)"
  echo "   Лог: /tmp/ai-office-sync.log"
  echo "   Удалить: crontab -e (удали строку с ai-office-sync)"
fi
