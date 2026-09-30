#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Copia las bases de PRODUCCIÓN (VE y CO) a STAGING. A la vez es la prueba de que los
# respaldos se pueden restaurar: al final compara filas tabla por tabla.
#
# Producción solo se LEE (pg_dump). Todo lo que se borra o escribe es dentro del
# contenedor inventory_db_staging.
#
# Uso en el VPS (desde /opt/inventory_staging):
#   ./scripts/staging-refrescar.sh                  # solo las bases
#   ./scripts/staging-refrescar.sh --con-archivos   # + copia los adjuntos (uploads)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

STAGING_DB="inventory_db_staging"
STAGING_DIR="/opt/inventory_staging"
PROD_DIR="/opt/inventory_next"
TMP="/opt/backups/staging_tmp"
PGUSER="postgres"

declare -A PROD=( [inventory_ve]="inventory_db_ve" [inventory_co]="inventory_db_co" )
declare -A TZS=(  [inventory_ve]="America/Caracas" [inventory_co]="America/Bogota" )

# ── Candados: este script jamás escribe en otra base que no sea la de staging ──
[ "$(pwd)" = "$STAGING_DIR" ] || { echo "Córrelo desde $STAGING_DIR" >&2; exit 1; }
case "$STAGING_DB" in *staging*) ;; *) echo "STAGING_DB no parece de staging" >&2; exit 1 ;; esac
docker inspect "$STAGING_DB" >/dev/null 2>&1 || { echo "No existe $STAGING_DB: levanta staging primero (./deploy-staging.sh)" >&2; exit 1; }

sql_staging() { docker exec -i "$STAGING_DB" psql -U "$PGUSER" -v ON_ERROR_STOP=1 -q "$@"; }

mkdir -p "$TMP"
STAMP="$(date +%F_%H%M)"

for db in "${!PROD[@]}"; do
  prod="${PROD[$db]}"
  dump="$TMP/${db}_${STAMP}.dump"

  echo "→ [$db] leyendo producción ($prod)…"
  docker exec "$prod" pg_dump -U "$PGUSER" -Fc "$db" > "$dump"
  echo "   $(du -h "$dump" | cut -f1)"

  echo "→ [$db] recreando la base en staging…"
  sql_staging -d postgres -c "DROP DATABASE IF EXISTS $db WITH (FORCE);"
  sql_staging -d postgres -c "CREATE DATABASE $db;"
  # Estado del server que NO está en el repo (ver CLAUDE.md, zona horaria por país).
  sql_staging -d postgres -c "ALTER DATABASE $db SET timezone='${TZS[$db]}';"

  echo "→ [$db] restaurando…"
  docker exec -i "$STAGING_DB" pg_restore -U "$PGUSER" -d "$db" --no-owner --no-privileges --exit-on-error < "$dump"

  echo "→ [$db] neutralizando lo que sale hacia personas reales…"
  sql_staging -d "$db" <<'SQL'
DO $$
BEGIN
  -- Equipos del Reportador copiados de producción: sin token, no pueden conectarse aquí.
  IF to_regclass('public.reportador_equipos') IS NOT NULL THEN
    UPDATE reportador_equipos SET token_hash = NULL, codigo = NULL, revocado_at = COALESCE(revocado_at, NOW());
  END IF;
  IF to_regclass('public.reportador_ordenes') IS NOT NULL THEN
    DELETE FROM reportador_ordenes;
  END IF;
  -- Sesiones abiertas de producción no valen en staging.
  IF to_regclass('public.user_sessions') IS NOT NULL THEN
    DELETE FROM user_sessions;
  END IF;
END $$;
SQL

  echo "→ [$db] comparando filas producción vs staging…"
  # Una consulta que cuenta las filas de cada tabla (armada por Postgres a partir de pg_tables).
  conteo="SELECT string_agg(format('SELECT %L AS t, count(*) AS n FROM %I', tablename, tablename), ' UNION ALL ') FROM pg_tables WHERE schemaname='public'"
  cons="$(docker exec "$prod" psql -U "$PGUSER" -d "$db" -Atc "$conteo")"
  # Se ordena fuera de Postgres (LC_ALL=C): producción (Debian) y staging (Alpine) ordenan
  # texto distinto, y un ORDER BY daría diferencias falsas.
  difs="$(diff <(docker exec "$prod" psql -U "$PGUSER" -d "$db" -Atc "$cons" | LC_ALL=C sort) \
               <(docker exec "$STAGING_DB" psql -U "$PGUSER" -d "$db" -Atc "$cons" | LC_ALL=C sort) \
          | grep -E '^[<>]' | grep -v -E '^[<>] (reportador_ordenes|user_sessions)\|' || true)"
  if [ -n "$difs" ]; then
    echo "$difs"
    echo "   ⚠ Tablas con distinta cantidad de filas (< producción, > staging). Si producción recibió datos durante la copia es normal; si no, revisar."
  else
    echo "   ✓ Mismas filas en todas las tablas"
  fi
  rm -f "$dump"
done

if [ "${1:-}" = "--con-archivos" ]; then
  echo "→ copiando adjuntos de producción (solo lectura en origen)…"
  mkdir -p "$STAGING_DIR/uploads"
  cp -a "$PROD_DIR/uploads/." "$STAGING_DIR/uploads/"
fi

echo "→ reiniciando la app de staging"
docker restart inventory_next_staging >/dev/null
echo "✓ Staging refrescado con datos de producción del $(date '+%F %H:%M')"
