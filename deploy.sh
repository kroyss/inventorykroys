#!/bin/bash
# Deploy del sistema nuevo en el VPS: baja los últimos cambios y reconstruye.
# Uso en el server:  /opt/inventory_next/deploy.sh
set -euo pipefail

cd /opt/inventory_next

echo "→ git pull"
git pull --ff-only origin main

echo "→ base arriba (no se recrea)"
docker compose -f docker-compose.prod.yml up -d --no-recreate inventory_db

# Sin corte (2026-10-13): app.elcomerciantedigital.com tiene dos copias detrás de nginx (upstream
# ecd_app) y se actualiza una por vez. inventory_next (inventory.syncsora.com, solo /api de los
# Reportadores viejos) y etiquetas tienen una sola copia: se recrean al final, como antes.
./scripts/rolling.sh docker-compose.prod.yml /etc/nginx/conf.d/ecd_app.conf ecd_app   inventory_ecd:8504 inventory_ecd_b:8505 inventory_next inventory_etiquetas

echo "→ limpiando imágenes viejas"
docker image prune -f >/dev/null

# --max-used-space NO sirve en este server (Docker con containerd: el 07-10 dejó 47 GB). Se borra la
# caché que no se usó en 24 h: la del último build queda y el próximo compila rápido igual.
echo "→ limpiando build cache (la que no se usó en 24 h)"
docker builder prune -af --filter until=24h >/dev/null

echo "✓ Deploy OK"
docker compose -f docker-compose.prod.yml ps
