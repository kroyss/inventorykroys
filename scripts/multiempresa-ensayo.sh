#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Ensayo de la base multiempresa, SOLO en staging.
#
# Arma `inventory_multi` dentro de inventory_db_staging a partir de las copias de
# staging (inventory_ve / inventory_co, que vienen de scripts/staging-refrescar.sh):
#   1. inventory_multi = copia de inventory_ve          (VE = empresa 1)
#   2. db/multiempresa/01_esquema.sql                    (empresa_id, RLS, FK compuestas)
#   3. db/multiempresa/02_importar_co.sql                (CO = empresa 2, ids +1.000.000)
#   4. db/multiempresa/03_verificar.sql                  (controles; no cambia nada)
# Se puede repetir las veces que haga falta: cada corrida parte de cero.
#
# Uso (desde /opt/inventory_staging):  ./scripts/multiempresa-ensayo.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

DB_CONT="inventory_db_staging"
NUEVA="inventory_multi"
DIR="/opt/inventory_staging"

[ "$(pwd)" = "$DIR" ] || { echo "Córrelo desde $DIR" >&2; exit 1; }
docker inspect "$DB_CONT" >/dev/null 2>&1 || { echo "No existe $DB_CONT" >&2; exit 1; }

psql_() { docker exec -i "$DB_CONT" psql -U postgres -v ON_ERROR_STOP=1 -q "$@"; }

echo "→ 1/4 base nueva a partir de la copia de VE"
psql_ -d postgres -c "DROP DATABASE IF EXISTS $NUEVA WITH (FORCE);"
psql_ -d postgres -c "CREATE DATABASE $NUEVA;"
psql_ -d postgres -c "ALTER DATABASE $NUEVA SET timezone='America/Caracas';"
docker exec "$DB_CONT" sh -c "pg_dump -U postgres -Fc inventory_ve | pg_restore -U postgres -d $NUEVA --no-owner --no-privileges --exit-on-error"

echo "→ 2/4 esquema multiempresa"
psql_ -d "$NUEVA" < db/multiempresa/01_esquema.sql

echo "→ 3/4 importando Colombia"
if ! salida="$(psql_ -d "$NUEVA" < db/multiempresa/02_importar_co.sql 2>&1)"; then
  echo "$salida"; echo "Falló la importación de CO" >&2; exit 1
fi
echo "$salida" | sed -n 's/.*NOTICE: *//p' 

echo "→ 4/4 verificación"
docker exec -i "$DB_CONT" psql -U postgres -v ON_ERROR_STOP=1 -d "$NUEVA" < db/multiempresa/03_verificar.sql
