#!/bin/bash
# Deploy de STAGING (copia de pruebas). No toca producción: usa su propia carpeta,
# su propio compose (docker-compose.staging.yml) y su propia base.
# Uso en el VPS:  /opt/inventory_staging/deploy-staging.sh [rama]   (por defecto main)
set -euo pipefail

cd /opt/inventory_staging
RAMA="${1:-main}"

echo "→ git fetch + checkout $RAMA"
git fetch origin
git checkout "$RAMA"
git pull --ff-only origin "$RAMA"

echo "→ build + up (solo contenedores *_staging)"
docker compose -f docker-compose.staging.yml up -d --build

echo "→ limpiando imágenes viejas"
docker image prune -f >/dev/null
# --max-used-space NO sirve en este server (Docker con containerd: el 07-10 dejó 47 GB). Se borra la
# caché que no se usó en 24 h: la del último build queda y el próximo compila rápido igual.
docker builder prune -af --filter until=24h >/dev/null

echo "✓ Staging OK en la rama $RAMA ($(git rev-parse --short HEAD))"
docker compose -f docker-compose.staging.yml ps
