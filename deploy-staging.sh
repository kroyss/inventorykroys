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
docker builder prune -af --max-used-space 5GB >/dev/null

echo "✓ Staging OK en la rama $RAMA ($(git rev-parse --short HEAD))"
docker compose -f docker-compose.staging.yml ps
