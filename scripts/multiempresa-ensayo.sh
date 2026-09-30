#!/usr/bin/env bash
# Ensayo de la migración multiempresa en staging (atajo). Ver scripts/multiempresa-migrar.sh.
set -euo pipefail
exec "$(dirname "$0")/multiempresa-migrar.sh" staging
