#!/bin/bash
# Actualización SIN CORTE (2026-10-13): dos copias de la app detrás de nginx; se cambia una por vez.
#
#   scripts/rolling.sh <compose.yml> <upstream.conf> <upstream> <servicio_a>:<puerto_a> <servicio_b>:<puerto_b> [otros…]
#
#   1. Compila la imagen nueva (las dos copias siguen atendiendo con la vieja).
#   2. Saca la copia B de nginx, espera que terminen sus pedidos, la recrea con la versión nueva y
#      espera a que responda. Mientras, atiende A.
#   3. Lo mismo con A (mientras, atiende B, ya nueva). 4. Las dos de vuelta en nginx.
#   Si una copia nueva no arranca, se corta aquí y nginx queda solo con la que funciona: no se cae nada.
#   [otros…] = servicios de una sola copia que se recrean al final (etiquetas, el de inventory.syncsora).
#
# DEPLOYMENT_ID (commit + hora) viaja a la compilación: Next recarga la página del que navega con la
# versión vieja, y la app muestra "Hay una versión nueva · Recargar" a quien se queda en una pantalla.
set -euo pipefail

COMPOSE=$1; CONF=$2; NOMBRE=$3; A=$4; B=$5; shift 5
OTROS=("$@")
SA=${A%%:*}; PA=${A##*:}; SB=${B%%:*}; PB=${B##*:}
DRENAR=10   # segundos para que terminen los pedidos en curso de la copia que sale

export DEPLOYMENT_ID="$(git rev-parse --short HEAD)-$(date +%Y%m%d%H%M%S)"

# nginx atiende solo con estos puertos (se recarga sin cortar conexiones).
upstream() {
  {
    echo "# Lo escribe scripts/rolling.sh ($(date '+%F %T')). No editar a mano."
    echo "upstream $NOMBRE {"
    for p in "$@"; do echo "    server 127.0.0.1:$p max_fails=1 fail_timeout=5s;"; done
    echo "}"
  } > "$CONF.tmp"
  mv "$CONF.tmp" "$CONF"
  nginx -t -q && nginx -s reload
}

# Responde la copia en este puerto (hasta 2 minutos).
listo() {
  for _ in $(seq 1 60); do
    curl -fsS -o /dev/null -m 5 "http://127.0.0.1:$1/login" && return 0
    sleep 2
  done
  return 1
}

cambiar() {   # servicio puerto puerto_de_la_otra
  echo "→ $1: sale de nginx, se actualiza (atiende :$3)"
  upstream "$3"
  sleep "$DRENAR"
  docker compose -f "$COMPOSE" up -d --no-deps --force-recreate "$1"
  if ! listo "$2"; then
    echo "✗ $1 no arrancó con la versión nueva: nginx sigue solo con :$3 (no se cayó nada). Revisa: docker logs $1"
    exit 1
  fi
  echo "  ✓ $1 responde en :$2"
}

echo "→ compilando la versión $DEPLOYMENT_ID (sigue atendiendo la actual)"
docker compose -f "$COMPOSE" build

cambiar "$SB" "$PB" "$PA"
cambiar "$SA" "$PA" "$PB"
upstream "$PA" "$PB"
echo "  ✓ nginx con las dos copias (:$PA y :$PB)"

if [ ${#OTROS[@]} -gt 0 ]; then
  echo "→ servicios de una copia: ${OTROS[*]}"
  docker compose -f "$COMPOSE" up -d --no-deps "${OTROS[@]}"
fi
