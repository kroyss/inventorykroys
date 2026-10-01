#!/bin/sh
# Trae las preguntas y mensajes de ML cada minuto (solo lee de MercadoLibre).
#   cron-preguntas.sh             → staging     (127.0.0.1:8511)
#   cron-preguntas.sh produccion  → producción  (127.0.0.1:8504, app.elcomerciantedigital.com)
if [ "$1" = "produccion" ]; then
  ENV=/opt/inventory_next/.env.production; PUERTO=8504; LOG=/var/log/preguntas.log
else
  ENV=/opt/inventory_staging/.env.staging; PUERTO=8511; LOG=/var/log/preguntas-staging.log
fi
KEY=$(grep "^CRON_SECRET=" "$ENV" | cut -d= -f2-)
curl -fsS -m 55 "http://127.0.0.1:$PUERTO/api/cron/preguntas?key=$KEY" >/dev/null 2>>"$LOG"
