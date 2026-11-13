-- 175: Recuperar la clave sin ayuda (13-11-2026, el dueño). lib/recuperarClave.ts · /login/recuperar
--
-- «¿Olvidaste tu contraseña?» manda un código de 6 dígitos al correo de la persona (Resend) y a su Telegram
-- (si lo vinculó en Mis avisos). Con el código elige una clave nueva y se cierran sus sesiones abiertas.
-- Tabla GLOBAL (como users / telegram_usuarios): se usa con dbGlobal(), sin empresa. Solo se guarda el HASH
-- del código, nunca el código. user_id NULL = pedido con un usuario/correo que no existe (cuenta para el
-- límite por conexión, sin decirle a nadie si el usuario existe).
-- Idempotente y compatible con la versión anterior (solo agrega).
BEGIN;

CREATE TABLE IF NOT EXISTS clave_codigos (
  id          BIGSERIAL PRIMARY KEY,
  user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
  codigo_hash TEXT,                               -- NULL cuando no había a quién mandarlo
  canales     TEXT[] NOT NULL DEFAULT '{}',       -- 'correo' / 'telegram': adónde salió
  ip_hash     TEXT,
  intentos    INTEGER NOT NULL DEFAULT 0,         -- códigos equivocados escritos
  creado_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expira_at   TIMESTAMPTZ NOT NULL,
  usado_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS clave_codigos_user ON clave_codigos (user_id, creado_at DESC);
CREATE INDEX IF NOT EXISTS clave_codigos_ip   ON clave_codigos (ip_hash, creado_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON clave_codigos TO inventory_app;
GRANT USAGE, SELECT ON SEQUENCE clave_codigos_id_seq TO inventory_app;

COMMIT;
