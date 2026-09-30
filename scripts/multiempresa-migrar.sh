#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Migración a la base multiempresa. EL MISMO script para el ensayo y para el día del
# cambio: lo que se ensaya en staging es exactamente lo que corre en producción.
#
#   ./scripts/multiempresa-migrar.sh staging                  (desde /opt/inventory_staging)
#   ./scripts/multiempresa-migrar.sh produccion --confirmar   (desde /opt/inventory_next)
#
# Pasos:
#   1. copia las bases de PRODUCCIÓN (inventory_db_ve / inventory_db_co, solo lectura)
#      al contenedor destino como inventory_ve / inventory_co;
#   2. arma la base nueva a partir de la copia de VE y corre
#      db/multiempresa/01_esquema → 02_importar_co → 04_funciones;
#   3. fija la clave del rol inventory_app (la de DATABASE_URL del .env de ese entorno);
#   4. corre 03_verificar y FALLA si algún control no da OK.
#
# Las bases viejas de producción NUNCA se escriben: son la vuelta atrás.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ENTORNO="${1:-}"
case "$ENTORNO" in
  staging)
    DIR=/opt/inventory_staging; DEST=inventory_db_staging; NUEVA=inventory_multi; ENVFILE=.env.staging ;;
  produccion)
    DIR=/opt/inventory_next;    DEST=inventory_db;         NUEVA=inventory;       ENVFILE=.env.production
    [ "${2:-}" = "--confirmar" ] || { echo "Producción: agrega --confirmar (ver CORTE.md)" >&2; exit 1; } ;;
  *) echo "Uso: $0 staging | produccion --confirmar" >&2; exit 1 ;;
esac

# ── Candados ──────────────────────────────────────────────────────────────
[ "$(pwd)" = "$DIR" ] || { echo "Córrelo desde $DIR" >&2; exit 1; }
case "$DEST" in inventory_db_ve|inventory_db_co) echo "El destino no puede ser una base vieja" >&2; exit 1 ;; esac
docker inspect "$DEST" >/dev/null 2>&1 || { echo "No existe el contenedor $DEST (levántalo primero, ver CORTE.md)" >&2; exit 1; }
CLAVE_APP="$(sed -n 's|^DATABASE_URL=postgresql://inventory_app:\([^@]*\)@.*|\1|p' "$ENVFILE")"
[ -n "$CLAVE_APP" ] || { echo "Falta DATABASE_URL=postgresql://inventory_app:...@.../$NUEVA en $ENVFILE" >&2; exit 1; }

psql_() { docker exec -i "$DEST" psql -U postgres -v ON_ERROR_STOP=1 -q "$@"; }
T0=$(date +%s)

# ── 1. Copias de producción ───────────────────────────────────────────────
declare -A ORIGEN=( [inventory_ve]=inventory_db_ve [inventory_co]=inventory_db_co )
declare -A TZS=(    [inventory_ve]=America/Caracas [inventory_co]=America/Bogota )
for db in inventory_ve inventory_co; do
  echo "→ copiando $db desde producción (${ORIGEN[$db]}, solo lectura)"
  psql_ -d postgres -c "DROP DATABASE IF EXISTS $db WITH (FORCE);"
  psql_ -d postgres -c "CREATE DATABASE $db;"
  psql_ -d postgres -c "ALTER DATABASE $db SET timezone='${TZS[$db]}';"
  docker exec "${ORIGEN[$db]}" pg_dump -U postgres -Fc "$db" \
    | docker exec -i "$DEST" pg_restore -U postgres -d "$db" --no-owner --no-privileges --exit-on-error
done

# ── 2. Base nueva ─────────────────────────────────────────────────────────
echo "→ base nueva $NUEVA a partir de la copia de VE"
psql_ -d postgres -c "DROP DATABASE IF EXISTS $NUEVA WITH (FORCE);"
psql_ -d postgres -c "CREATE DATABASE $NUEVA;"
psql_ -d postgres -c "ALTER DATABASE $NUEVA SET timezone='America/Caracas';"
docker exec "$DEST" sh -c "pg_dump -U postgres -Fc inventory_ve | pg_restore -U postgres -d $NUEVA --no-owner --no-privileges --exit-on-error"

echo "→ 01 esquema multiempresa"
psql_ -d "$NUEVA" < db/multiempresa/01_esquema.sql
echo "→ 02 importando Colombia"
if ! salida="$(psql_ -d "$NUEVA" < db/multiempresa/02_importar_co.sql 2>&1)"; then
  echo "$salida"; echo "Falló la importación de CO" >&2; exit 1
fi
echo "$salida" | sed -n 's/.*NOTICE: *//p' | grep -v ': 0 filas' || true
echo "→ 04 funciones para accesos sin sesión"
psql_ -d "$NUEVA" < db/multiempresa/04_funciones.sql

# ── 3. Clave del rol de la app ────────────────────────────────────────────
echo "→ clave de inventory_app (desde $ENVFILE)"
psql_ -d postgres -c "ALTER ROLE inventory_app PASSWORD '$CLAVE_APP';"

# ── 4. Verificación ───────────────────────────────────────────────────────
echo "→ 03 verificación"
verif="$(docker exec -i "$DEST" psql -U postgres -v ON_ERROR_STOP=1 -d "$NUEVA" < db/multiempresa/03_verificar.sql)"
echo "$verif" | grep -E 'FALLA|controles' || true
if ! echo "$verif" | grep -q ' 0 FALLAS'; then
  echo "✗ La verificación tiene FALLAS: NO seguir con el cambio." >&2
  exit 1
fi
# Staging, DESPUÉS de verificar (la verificación compara contra el origen tal cual): la
# copia trae datos reales, así que el Reportador no puede conectarse ni retomar órdenes.
if [ "$ENTORNO" = "staging" ]; then
  echo "→ staging: Reportador neutralizado (copia de datos reales)"
  psql_ -d "$NUEVA" -c "UPDATE reportador_equipos SET token_hash = NULL, codigo = NULL, revocado_at = COALESCE(revocado_at, NOW()); DELETE FROM reportador_ordenes;"
fi
echo "✓ Base $NUEVA lista y verificada en $(( $(date +%s) - T0 )) s"
