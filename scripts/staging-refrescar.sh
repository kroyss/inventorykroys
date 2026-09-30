#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Copia la base de PRODUCCIÓN (compartida multiempresa: inventory_db / inventory) a
# STAGING (inventory_db_staging / inventory_multi). A la vez es la prueba de que los
# respaldos se pueden restaurar: al final compara filas tabla por tabla.
#
# Producción solo se LEE (pg_dump). Todo lo que se borra o escribe es dentro del
# contenedor inventory_db_staging.
#
# Uso en el VPS (desde /opt/inventory_staging):
#   ./scripts/staging-refrescar.sh                  # solo la base
#   ./scripts/staging-refrescar.sh --con-archivos   # + copia los adjuntos (uploads)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

PROD_DB="inventory_db";         PROD_NOMBRE="inventory"
STAGING_DB="inventory_db_staging"; STAGING_NOMBRE="inventory_multi"
STAGING_DIR="/opt/inventory_staging"
PROD_DIR="/opt/inventory_next"
TMP="/opt/backups/staging_tmp"
PGUSER="postgres"

# ── Candados: este script jamás escribe en otra base que no sea la de staging ──
[ "$(pwd)" = "$STAGING_DIR" ] || { echo "Córrelo desde $STAGING_DIR" >&2; exit 1; }
case "$STAGING_DB" in *staging*) ;; *) echo "STAGING_DB no parece de staging" >&2; exit 1 ;; esac
docker inspect "$STAGING_DB" >/dev/null 2>&1 || { echo "No existe $STAGING_DB: levanta staging primero (./deploy-staging.sh)" >&2; exit 1; }
CLAVE_APP="$(sed -n 's|^DATABASE_URL=postgresql://inventory_app:\([^@]*\)@.*|\1|p' .env.staging)"
[ -n "$CLAVE_APP" ] || { echo "Falta DATABASE_URL=postgresql://inventory_app:...@... en .env.staging" >&2; exit 1; }

sql_staging() { docker exec -i "$STAGING_DB" psql -U "$PGUSER" -v ON_ERROR_STOP=1 -q "$@"; }

mkdir -p "$TMP"
dump="$TMP/${PROD_NOMBRE}_$(date +%F_%H%M).dump"

echo "→ leyendo producción ($PROD_DB / $PROD_NOMBRE)…"
docker exec "$PROD_DB" pg_dump -U "$PGUSER" -Fc "$PROD_NOMBRE" > "$dump"
echo "   $(du -h "$dump" | cut -f1)"

echo "→ recreando la base en staging…"
# El rol de la app existe a nivel del servidor de staging (lo crea 01_esquema.sql); si
# todavía no, se crea aquí. Su clave es la de .env.staging.
sql_staging -d postgres <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'inventory_app') THEN
    CREATE ROLE inventory_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END \$\$;
ALTER ROLE inventory_app PASSWORD '$CLAVE_APP';
DROP DATABASE IF EXISTS $STAGING_NOMBRE WITH (FORCE);
CREATE DATABASE $STAGING_NOMBRE;
ALTER DATABASE $STAGING_NOMBRE SET timezone='America/Caracas';
SQL

echo "→ restaurando (con permisos: el rol de la app no salta RLS)…"
docker exec -i "$STAGING_DB" pg_restore -U "$PGUSER" -d "$STAGING_NOMBRE" --no-owner --exit-on-error < "$dump"

echo "→ neutralizando lo que sale hacia personas reales…"
sql_staging -d "$STAGING_NOMBRE" <<'SQL'
-- Equipos del Reportador copiados de producción: sin token, no pueden conectarse aquí.
UPDATE reportador_equipos SET token_hash = NULL, codigo = NULL, revocado_at = COALESCE(revocado_at, NOW());
DELETE FROM reportador_ordenes;
SQL

echo "→ comparando filas producción vs staging…"
conteo="SELECT string_agg(format('SELECT %L AS t, count(*) AS n FROM %I', tablename, tablename), ' UNION ALL ') FROM pg_tables WHERE schemaname='public'"
cons="$(docker exec "$PROD_DB" psql -U "$PGUSER" -d "$PROD_NOMBRE" -Atc "$conteo")"
# Se ordena fuera de Postgres (LC_ALL=C): producción (Debian) y staging (Alpine) ordenan
# texto distinto, y un ORDER BY daría diferencias falsas. Como postgres, sin RLS.
difs="$(diff <(docker exec "$PROD_DB" psql -U "$PGUSER" -d "$PROD_NOMBRE" -Atc "$cons" | LC_ALL=C sort) \
             <(docker exec "$STAGING_DB" psql -U "$PGUSER" -d "$STAGING_NOMBRE" -Atc "$cons" | LC_ALL=C sort) \
        | grep -E '^[<>]' | grep -v -E '^[<>] (reportador_ordenes)\|' || true)"
if [ -n "$difs" ]; then
  echo "$difs"
  echo "   ⚠ Tablas con distinta cantidad de filas (< producción, > staging). Si producción recibió datos durante la copia es normal; si no, revisar."
else
  echo "   ✓ Mismas filas en todas las tablas"
fi
rm -f "$dump"

if [ "${1:-}" = "--con-archivos" ]; then
  echo "→ copiando adjuntos de producción (solo lectura en origen)…"
  mkdir -p "$STAGING_DIR/uploads"
  cp -a "$PROD_DIR/uploads/." "$STAGING_DIR/uploads/"
fi

echo "→ reiniciando la app de staging"
docker restart inventory_next_staging >/dev/null
echo "✓ Staging refrescado con datos de producción del $(date '+%F %H:%M')"
