#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Respaldo de las bases de datos KROYS (VE y CO) — sistema legacy + nuevo
# comparten estas mismas DB, así que este backup cubre a ambos.
#
# Uso en el servidor (Contabo):
#   chmod +x backup-db.sh
#   ./backup-db.sh                 # respaldo manual inmediato
#
# Cron diario (3:00 AM):
#   crontab -e
#   0 3 * * * /opt/inventory_next/scripts/backup-db.sh >> /var/log/kroys_backup.log 2>&1
#
# Restaurar (ejemplo VE):
#   gunzip -c /opt/backups/kroys/backup_ve_2026-06-04_0300.sql.gz \
#     | docker exec -i inventory_db_ve psql -U postgres inventory_ve
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# --- Config (ajusta si cambian nombres de contenedor/DB/usuario) ---
DEST="${BACKUP_DIR:-/opt/backups/kroys}"
PGUSER="${PGUSER:-postgres}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"   # cuántos días de respaldos conservar

declare -A DBS=(
  [ve]="inventory_db_ve:inventory_ve"
  [co]="inventory_db_co:inventory_co"
)

mkdir -p "$DEST"
STAMP="$(date +%F_%H%M)"
ok=0; fail=0

for key in "${!DBS[@]}"; do
  container="${DBS[$key]%%:*}"
  dbname="${DBS[$key]##*:}"
  out="$DEST/backup_${key}_${STAMP}.sql.gz"

  if docker exec "$container" pg_dump -U "$PGUSER" "$dbname" 2>/dev/null | gzip > "$out"; then
    size="$(du -h "$out" | cut -f1)"
    echo "[$(date +%T)] OK  $dbname -> $out ($size)"
    ok=$((ok+1))
  else
    echo "[$(date +%T)] FALLO al respaldar $dbname (contenedor $container)" >&2
    rm -f "$out"
    fail=$((fail+1))
  fi
done

# --- Rotación: borra respaldos más viejos que RETENTION_DAYS ---
find "$DEST" -name 'backup_*.sql.gz' -type f -mtime "+${RETENTION_DAYS}" -delete

echo "[$(date +%T)] Respaldo terminado: $ok ok, $fail fallidos. Destino: $DEST"
[ "$fail" -eq 0 ]
