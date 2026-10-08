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

# --max-used-space NO sirve en este server (Docker con containerd: el 07-10 dejó 47 GB). Se borra la
# caché que no se usó en 24 h: la del último build queda y el próximo compila rápido igual.
echo "→ limpiando build cache (la que no se usó en 24 h)"
docker builder prune -af --filter until=24h >/dev/null

echo "✓ Deploy OK"
docker compose -f docker-compose.prod.yml ps
