#!/bin/sh
# Resumen del medidor de rapidez (lib/db.ts): consultas lentas de las dos copias de producción.
# Uso: ./scripts/lentos.sh [horas=1] [contenedores...]   Ej.: ./scripts/lentos.sh 3
HORAS=${1:-1}; shift 2>/dev/null
CONT=${*:-"inventory_ecd inventory_ecd_b"}
for c in $CONT; do docker logs --since "${HORAS}h" "$c" 2>&1; done > /tmp/lentos.log
echo "== Por ruta (veces · ms máx · ms promedio) — últimas ${HORAS} h =="
grep '\[LENTO\]' /tmp/lentos.log | sed -E 's/.*\[LENTO\] ([0-9]+)ms emp=[^ ]+ ruta=([^ ]+).*/\2 \1/' \
  | awk '{n[$1]++; s[$1]+=$2; if($2>m[$1])m[$1]=$2} END{for(r in n) printf "%-55s %4d  %6d  %6d\n", r, n[r], m[r], s[r]/n[r]}' | sort -k3 -nr | head -40
echo; echo "== Requests con mucho tiempo de base (REQ_DB) =="
grep '\[REQ_DB\]' /tmp/lentos.log | sed -E 's/.*\[REQ_DB\] ([0-9]+)ms ([0-9]+) consultas emp=[^ ]+ ruta=([^ ]+).*/\3 \1 \2/' \
  | awk '{n[$1]++; s[$1]+=$2; if($2>m[$1])m[$1]=$2; q[$1]=$3} END{for(r in n) printf "%-55s %4d  máx %6dms  prom %6dms  (%s consultas)\n", r, n[r], m[r], s[r]/n[r], q[r]}' | sort -k4 -nr | head -20
echo; echo "== Servidor trabado ([LAG], por minuto) =="; grep '\[LAG\]' /tmp/lentos.log | tail -15
echo; echo "== Esperas de conexión (pool lleno) =="
grep -c '\[ESPERA\]' /tmp/lentos.log
echo; echo "== Las 10 consultas más lentas =="
grep '\[LENTO\]' /tmp/lentos.log | sed -E 's/^.*(\[LENTO\])/\1/' | sort -k2 -nr | head -10 | cut -c1-260
