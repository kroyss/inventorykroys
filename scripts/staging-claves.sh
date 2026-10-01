#!/bin/sh
# Carga las claves secretas de MercadoLibre / IA SIN editar archivos a mano.
# Se corre desde la PC:
#   ssh -t root@85.239.249.43 /opt/inventory_staging/scripts/staging-claves.sh          (staging)
#   ssh -t root@85.239.249.43 /opt/inventory_next/scripts/staging-claves.sh produccion  (producción)
# Pregunta cada clave (lo que pegas no se ve en pantalla), la guarda en el .env del entorno
# (reemplaza la anterior si ya había una) y reinicia. Enter vacío = no cambiar.
set -e
if [ "$1" = "produccion" ]; then
  DIR=/opt/inventory_next; ENV=$DIR/.env.production; COMPOSE=docker-compose.prod.yml; CONT=inventory_ecd
else
  DIR=/opt/inventory_staging; ENV=$DIR/.env.staging; COMPOSE=docker-compose.staging.yml; CONT=inventory_next_staging
fi
cd "$DIR"
echo "Entorno: $DIR"

poner() {
  clave=$1; texto=$2; empieza=$3
  printf '\n%s\n(pega y Enter; no se verá nada al pegar · Enter vacío = dejar como está): ' "$texto"
  stty -echo 2>/dev/null || true
  IFS= read -r valor || true
  stty echo 2>/dev/null || true
  printf '\n'
  valor=$(printf '%s' "$valor" | tr -d '\r\n' | sed 's/^ *//; s/ *$//')
  if [ -z "$valor" ]; then echo "  → $clave sin cambios"; return; fi
  if [ -n "$empieza" ] && [ "${valor#"$empieza"}" = "$valor" ]; then
    echo "  ✗ No parece una clave válida (debería empezar con $empieza). No se guardó."; return
  fi
  cp "$ENV" "$ENV.bak"
  grep -v "^$clave=" "$ENV.bak" > "$ENV"
  printf '%s=%s\n' "$clave" "$valor" >> "$ENV"
  chmod 600 "$ENV"; rm -f "$ENV.bak"
  echo "  ✓ $clave guardada (${#valor} caracteres)"
  CAMBIO=1
}

CAMBIO=0
poner ML_CLIENT_SECRET  "Clave secreta de la app de MercadoLibre (DevCenter → tu app → Client Secret)" ""
poner ANTHROPIC_API_KEY "Clave de la API de Anthropic (console.anthropic.com → API Keys)"             "sk-ant-"

if [ "$CAMBIO" = 1 ]; then
  echo; echo "Reiniciando…"
  docker compose -f "$COMPOSE" up -d >/dev/null 2>&1
  i=0; until docker ps --filter "name=^$CONT\$" --format '{{.Status}}' | grep -q healthy; do
    i=$((i+1)); [ $i -gt 40 ] && { echo "✗ No arrancó a tiempo: avísale a Claude"; exit 1; }; sleep 3
  done
  echo "✓ Listo. Ya usa las claves nuevas."
else
  echo; echo "No se cambió nada."
fi
