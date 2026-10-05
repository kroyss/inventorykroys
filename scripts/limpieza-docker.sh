#!/bin/sh
# Limpieza diaria del disco del VPS (crontab de root, 5:00 hora Caracas).
# El 2026-10-05 el disco se llenó al 100% con 61 GB de caché de compilación de Docker
# (todos los proyectos del server compilan aquí). Esto SOLO borra:
#   - caché de compilación (BuildKit), dejando la más reciente hasta 5 GB (compila rápido igual);
#   - imágenes "colgadas" (<none>, sin etiqueta: las que reemplazó un build nuevo).
# NO toca: contenedores, volúmenes (bases de datos), redes ni imágenes con etiqueta o en uso.
# Nada de "docker system prune" ni "--volumes".
echo "== $(date '+%F %T') antes: $(df -h / | awk 'NR==2 {print $3" usados, "$5}')"
docker builder prune -af --max-used-space 5GB >/dev/null 2>&1 || echo "builder prune falló"
docker image prune -f >/dev/null 2>&1 || echo "image prune falló"
echo "   después: $(df -h / | awk 'NR==2 {print $3" usados, "$5}')"
