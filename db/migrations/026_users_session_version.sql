-- 026 · Usuarios: versión de sesión para poder CERRAR las sesiones abiertas de alguien.
--
-- La sesión (JWT, 12 h renovables) no se guarda en la base: sin esto, un usuario
-- desactivado o con contraseña cambiada seguía entrando mientras tuviera la pestaña
-- abierta. Al desactivar / cambiar contraseña / cambiar rol se incrementa este número;
-- cada request compara el de su sesión con el de la base (lib/auth.ts) y si no coincide
-- la sesión se descarta.
--
-- Idempotente. Correr en ambas DBs. El código tolera que la columna aún no exista
-- (la lee vía to_jsonb), así que el orden deploy/migración no deja a nadie afuera.

ALTER TABLE users ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 0;
