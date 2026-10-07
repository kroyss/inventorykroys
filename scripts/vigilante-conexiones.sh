#!/bin/sh
# Vigilante de conexiones de la app a la base (crontab del VPS, cada minuto).
#
# Por qué: el 06-10-2026 un cambio dejaba una conexión tomada en cada página vista; en ~1 h se
# agotó el pool (10) y login y APIs daban 504 por 1h20. Una conexión sana de la app vuelve al
# pool en milisegundos y el pool cierra las ociosas a los 10 s: si hay varias "idle" de más de
# 5 minutos, están perdidas (alguien no las devolvió).
#
# Qué hace: si hay UMBRAL o más conexiones de inventory_app ociosas hace más de 5 min, reinicia
# los contenedores de la app (docker restart: NO toca la base ni los datos) y lo anota en el log.
# Como máximo un reinicio cada 15 minutos (no entra en bucle si el problema sigue).
#   crontab: * * * * * /opt/inventory_next/scripts/vigilante-conexiones.sh
#   Prueba sin reiniciar: DRY=1 UMBRAL=0 ./scripts/vigilante-conexiones.sh
UMBRAL=${UMBRAL:-5}
LOG=/var/log/vigilante-conexiones.log
MARCA=/tmp/vigilante-conexiones.ultimo
ESPERA_SEG=900

pegadas=$(docker exec inventory_db psql -U postgres -d inventory -tAc \
  "SELECT COUNT(*) FROM pg_stat_activity WHERE usename = 'inventory_app' AND state = 'idle'
     AND NOW() - state_change > INTERVAL '5 minutes'" 2>/dev/null | tr -d ' ')
ahora=$(date '+%Y-%m-%d %H:%M:%S')

if [ -z "$pegadas" ]; then
  echo "$ahora no se pudo consultar la base" >> "$LOG"
  exit 0
fi
[ -n "$DRY" ] && echo "$ahora pegadas=$pegadas umbral=$UMBRAL (prueba, no reinicia)"
[ "$pegadas" -lt "$UMBRAL" ] && exit 0

if [ -f "$MARCA" ] && [ $(( $(date +%s) - $(cat "$MARCA") )) -lt "$ESPERA_SEG" ]; then
  echo "$ahora $pegadas conexiones pegadas; ya se reinició hace menos de 15 min, no se repite" >> "$LOG"
  exit 0
fi
if [ -n "$DRY" ]; then
  echo "$ahora (prueba) se reiniciaría inventory_ecd e inventory_next"
  exit 0
fi
date +%s > "$MARCA"
echo "$ahora $pegadas conexiones pegadas: reinicio inventory_ecd e inventory_next" >> "$LOG"
docker restart inventory_ecd inventory_next >> "$LOG" 2>&1
