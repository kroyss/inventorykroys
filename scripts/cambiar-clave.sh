#!/bin/sh
# Pone una clave nueva a un usuario directo en la base, sin entrar al sistema (p. ej. si el dueño
# quedó afuera). Se corre desde la PC:
#   ssh -t root@85.239.249.43 /opt/inventory_next/scripts/cambiar-clave.sh            (producción)
#   ssh -t root@85.239.249.43 /opt/inventory_next/scripts/cambiar-clave.sh staging    (staging)
# Pregunta el usuario y la clave dos veces (no se ve al escribir). La clave se cifra con bcrypt
# DENTRO de Postgres (pgcrypto, mismo formato que usa el login) y nunca queda en un archivo.
# Cierra las sesiones abiertas de ese usuario (session_version) y lo reactiva si estaba desactivado.
set -e
if [ "$1" = "staging" ]; then CONT=inventory_db_staging; DB=inventory_multi; else CONT=inventory_db; DB=inventory; fi
echo "Base: $CONT/$DB"

printf 'Usuario: '; IFS= read -r usuario
usuario=$(printf '%s' "$usuario" | tr -d '\r' | tr 'A-Z' 'a-z' | sed 's/^ *//; s/ *$//')
existe=$(docker exec "$CONT" psql -U postgres -d "$DB" -Atc "SELECT COUNT(*) FROM users WHERE username = '$(printf '%s' "$usuario" | sed "s/'/''/g")'")
[ "$existe" = "1" ] || { echo "✗ No existe el usuario \"$usuario\""; exit 1; }

stty -echo 2>/dev/null || true
printf 'Clave nueva (mínimo 8, no se ve): '; IFS= read -r c1; printf '\n'
printf 'Repítela: '; IFS= read -r c2; printf '\n'
stty echo 2>/dev/null || true
c1=$(printf '%s' "$c1" | tr -d '\r'); c2=$(printf '%s' "$c2" | tr -d '\r')
[ "$c1" = "$c2" ] || { echo "✗ No coinciden. No se cambió nada."; exit 1; }
[ ${#c1} -ge 8 ] || { echo "✗ Muy corta (mínimo 8). No se cambió nada."; exit 1; }

docker exec -i -e U="$usuario" -e C="$c1" "$CONT" sh -c 'psql -U postgres -d '"$DB"' -v ON_ERROR_STOP=1 -q -v u="$U" -v c="$C"' <<'SQL'
CREATE EXTENSION IF NOT EXISTS pgcrypto;
UPDATE users SET password_hash = crypt(:'c', gen_salt('bf', 10)), is_active = TRUE,
       session_version = session_version + 1
WHERE username = :'u';
SQL
echo "✓ Clave cambiada para \"$usuario\". Entra con la nueva."
