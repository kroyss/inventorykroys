#!/bin/sh
# Carga las claves secretas de Preguntas ML en staging SIN editar archivos a mano.
# Se corre desde la PC:   ssh -t root@85.239.249.43 /opt/inventory_staging/scripts/staging-claves.sh
# Pregunta cada clave (lo que pegas no se ve en pantalla), la guarda en .env.staging
# (reemplaza la anterior si ya había una) y reinicia el contenedor. Enter vacío = no cambiar.
set -e
ENV=/opt/inventory_staging/.env.staging
cd /opt/inventory_staging

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
  echo; echo "Reiniciando staging…"
  docker compose -f docker-compose.staging.yml up -d >/dev/null 2>&1
  i=0; until docker ps --filter name=inventory_next_staging --format '{{.Status}}' | grep -q healthy; do
    i=$((i+1)); [ $i -gt 40 ] && { echo "✗ No arrancó a tiempo: avísale a Claude"; exit 1; }; sleep 3
  done
  echo "✓ Listo. Staging ya usa las claves nuevas."
else
  echo; echo "No se cambió nada."
fi
