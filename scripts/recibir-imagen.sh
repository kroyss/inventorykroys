#!/bin/bash
# Lo único que puede hacer la llave de GitHub en el VPS (forced command en ~/.ssh/authorized_keys, 23-10-2026):
#   "tiene <commit>"   → sale 0 si la imagen inventory-ci:<commit> ya está (para no compilar dos veces)
#   "cargar <commit>"  → recibe por stdin la imagen (docker save | gzip) y la deja como inventory-ci:<commit>
# Cualquier otra cosa se rechaza. Ver .github/workflows/imagen.yml y scripts/rolling.sh.
set -euo pipefail
read -r ORDEN COMMIT EXTRA <<< "${SSH_ORIGINAL_COMMAND:-}"
[[ -z "${EXTRA:-}" && "$COMMIT" =~ ^[0-9a-f]{7,40}$ ]] || { echo "pedido no permitido" >&2; exit 2; }
case "$ORDEN" in
  tiene)  docker image inspect "inventory-ci:$COMMIT" >/dev/null 2>&1 ;;
  cargar)
    gunzip | docker load -q >/dev/null
    docker image inspect "inventory-ci:$COMMIT" >/dev/null
    echo "$(date '+%F %T') recibida inventory-ci:$COMMIT" >> /var/log/recibir-imagen.log
    # Quedan las 4 más nuevas (para volver atrás sin compilar); las demás se borran.
    docker images inventory-ci --format '{{.CreatedAt}}|{{.Tag}}' | sort -r | tail -n +5 | cut -d'|' -f2 \
      | while read -r t; do docker rmi -f "inventory-ci:$t" >/dev/null 2>&1 || true; done
    ;;
  *) echo "pedido no permitido" >&2; exit 2 ;;
esac
