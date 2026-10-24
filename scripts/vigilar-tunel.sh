#!/bin/sh
# Vigilante del túnel de Cloudflare (24-10-2026). Lo corre el cron del VPS cada 2 minutos:
#   */2 * * * * /opt/inventory_next/scripts/vigilar-tunel.sh >/dev/null 2>&1
# Si cloudflared no está conectado: lo reinicia y avisa por Telegram al dueño (kroys). Un aviso por caída y otro
# cuando vuelve (no repite cada 2 min). Mientras no exista el servicio cloudflared, no hace nada.
# El token del bot se lee de /root/telegram_bot.env y nunca se muestra.

ESTADO=/var/lib/vigilar-tunel.estado
systemctl list-unit-files cloudflared.service >/dev/null 2>&1 || exit 0
systemctl cat cloudflared >/dev/null 2>&1 || exit 0

# ¿Conectado? El servicio activo y su /ready en 200 (al menos una conexión con Cloudflare).
conectado() {
  systemctl is-active --quiet cloudflared || return 1
  for p in 20241 20242 20243 20244 20245; do
    [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "http://127.0.0.1:$p/ready")" = "200" ] && return 0
  done
  return 1
}

avisar() {
  . /root/telegram_bot.env 2>/dev/null
  [ -n "$TELEGRAM_BOT_TOKEN" ] || return 0
  chat=$(docker exec inventory_db psql -U postgres -d inventory -At -c \
    "SELECT t.chat_id FROM telegram_usuarios t JOIN users u ON u.id = t.user_id
     WHERE u.username = 'kroys' AND t.entorno = 'produccion' AND t.chat_id IS NOT NULL LIMIT 1" 2>/dev/null)
  [ -n "$chat" ] || return 0
  curl -s --max-time 10 "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    --data-urlencode "chat_id=$chat" --data-urlencode "text=$1" >/dev/null
}

antes=$(cat "$ESTADO" 2>/dev/null || echo ok)
if conectado; then
  [ "$antes" = "caido" ] && avisar "✅ Túnel de Cloudflare: volvió a conectar. La página funciona normal."
  echo ok > "$ESTADO"
  exit 0
fi

# Caído: se reinicia y se espera a que conecte.
systemctl restart cloudflared
sleep 30
if conectado; then
  avisar "⚠️ Túnel de Cloudflare: se cayó y el servidor lo reinició solo. Ya está conectado de nuevo."
  echo ok > "$ESTADO"
else
  [ "$antes" = "caido" ] || avisar "🔴 Túnel de Cloudflare caído y no volvió al reiniciarlo: la página puede no abrir. Plan B: en Cloudflare quitar la ruta del túnel de ese dominio y volver a crear su registro A apuntando a 85.239.249.43 (Proxied)."
  echo caido > "$ESTADO"
fi
