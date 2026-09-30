#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Respaldo de las bases de datos KROYS (VE y CO) — sistema legacy + nuevo
# comparten estas mismas DB, así que este backup cubre a ambos.
#
# Uso en el servidor (Contabo):
#   chmod +x backup-db.sh
#   ./backup-db.sh                 # respaldo manual inmediato
#   ./backup-db.sh antes-031       # respaldo ANTES de una migración: va a
#                                  # $DEST/antes-de-migrar/ y NO se borra solo
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

ETIQUETA="${1:-}"
if [ -n "$ETIQUETA" ]; then
  [[ "$ETIQUETA" =~ ^[A-Za-z0-9_-]+$ ]] || { echo "Etiqueta inválida: solo letras, números, - y _" >&2; exit 1; }
  SALIDA="$DEST/antes-de-migrar"
  SUFIJO="_${ETIQUETA}"
else
  SALIDA="$DEST"
  SUFIJO=""
fi
mkdir -p "$SALIDA"
STAMP="$(date +%F_%H%M)"
ok=0; fail=0

for key in "${!DBS[@]}"; do
  container="${DBS[$key]%%:*}"
  dbname="${DBS[$key]##*:}"
  out="$SALIDA/backup_${key}_${STAMP}${SUFIJO}.sql.gz"

  # pipefail: si pg_dump falla a mitad, el pipe falla (no queda un .gz truncado como bueno).
  # gzip -t + tamaño mínimo: el archivo se puede descomprimir y no está vacío.
  if docker exec "$container" pg_dump -U "$PGUSER" "$dbname" | gzip > "$out"      && gzip -t "$out" && [ "$(gzip -cd "$out" | head -c 100000 | wc -c)" -gt 1000 ]; then
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
# (solo la carpeta principal: los respaldos "antes-de-migrar" se conservan)
find "$DEST" -maxdepth 1 -name 'backup_*.sql.gz' -type f -mtime "+${RETENTION_DAYS}" -delete

echo "[$(date +%T)] Respaldo terminado: $ok ok, $fail fallidos. Destino: $SALIDA"
[ "$fail" -eq 0 ]
