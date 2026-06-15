#!/bin/bash
# Deploy del sistema nuevo en el VPS: baja los últimos cambios y reconstruye.
# Uso en el server:  /opt/inventory_next/deploy.sh
set -euo pipefail

cd /opt/inventory_next

echo "→ git pull"
git pull --ff-only origin main

echo "→ build + up (sin tumbar el contenedor hasta que la imagen nueva esté lista)"
docker compose -f docker-compose.prod.yml up -d --build

echo "→ limpiando imágenes viejas"
docker image prune -f >/dev/null

echo "✓ Deploy OK"
docker compose -f docker-compose.prod.yml ps
