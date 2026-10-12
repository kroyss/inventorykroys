-- 081: permisos por usuario (2026-10-12, lib/permisos.ts). Lo que el admin le marca a un usuario
-- en Usuarios (secciones y acciones). NULL = nunca se tocó = los de su rol, o sea exactamente lo
-- que veía antes de este cambio: nadie gana ni pierde nada al aplicarla. A los admin no se les
-- aplica (siempre tienen todo). Idempotente.

ALTER TABLE usuario_empresas ADD COLUMN IF NOT EXISTS permisos TEXT[];
