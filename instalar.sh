#!/usr/bin/env bash
# Instala (o actualiza) el monitor IPUL en el VPS y lo programa cada 10 minutos.
# Uso, como root:  bash <(curl -fsSL https://raw.githubusercontent.com/ipultvCom/ipul-monitor/main/instalar.sh)
set -euo pipefail
DIR=/opt/ipul-monitor

NODE=$(command -v node || true)
if [ -z "$NODE" ]; then echo "❌ No se encontró Node.js en el VPS. Avísale a Claude."; exit 1; fi

if [ -d "$DIR/.git" ]; then
  git -C "$DIR" pull -q
else
  git clone -q https://github.com/ipultvCom/ipul-monitor.git "$DIR"
fi
cd "$DIR"

if grep -qs "pega_aqui" monitor.env || [ ! -s monitor.env ]; then
  echo
  echo "Pega los datos de Telegram (clic derecho → Pegar) y pulsa Enter después de cada uno."
  read -r -p "Token del bot (de @BotFather): " TOKEN </dev/tty
  read -r -p "Tu Chat ID (de @userinfobot): " CHAT </dev/tty
  TOKEN=$(echo "$TOKEN" | tr -d '[:space:]'); CHAT=$(echo "$CHAT" | tr -d '[:space:]')
  cat > monitor.env <<EOF
TELEGRAM_BOT_TOKEN=$TOKEN
TELEGRAM_CHAT_ID=$CHAT
STATE_FILE=$DIR/state.json
MONITOR_NAME=VPS
EOF
fi
chmod 600 monitor.env

echo; echo "Enviando mensaje de prueba a Telegram…"
set +e
( set -a; . ./monitor.env; set +a; TELEGRAM_TEST=true "$NODE" check.mjs ) | grep -E "Telegram|❌"
set -e

LINE="*/10 * * * * cd $DIR && set -a && . ./monitor.env && set +a && $NODE check.mjs > /var/log/ipul-monitor.log 2>&1"
( crontab -l 2>/dev/null | grep -v "ipul-monitor" ; echo "$LINE" ) | crontab -
echo; echo "✅ Listo: el monitor revisará tus sitios cada 10 minutos."
echo "   Si no te llegó el mensaje de prueba, vuelve a ejecutar el instalador después de borrar monitor.env:"
echo "   rm $DIR/monitor.env"
