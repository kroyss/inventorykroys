#!/bin/sh
# Staging: trae las preguntas de ML cada minuto (solo lee de MercadoLibre).
KEY=$(grep "^CRON_SECRET=" /opt/inventory_staging/.env.staging | cut -d= -f2-)
curl -fsS -m 55 "http://127.0.0.1:8511/api/cron/preguntas?key=$KEY" >/dev/null 2>>/var/log/preguntas-staging.log
