-- 125 · Prueba gratis de 15 días con autoregistro (26-10, decisión del dueño). Fundadores quedan como están (30 días,
--   30% de por vida); desde ahora cualquiera se registra solo en /registro y entra a una prueba de 15 días.
--   organizaciones.origen   'autoregistro' (NULL = la creó el dueño en Plataforma).
--   organizaciones.registro lo que dejó en el formulario (correo, WhatsApp, Telegram, qué busca) para contactarlo.
--   ml_pruebas_usadas       GLOBAL: cada cuenta de MercadoLibre que ya estuvo en el sistema. Una cuenta de ML tiene UNA
--                           sola prueba: una organización de autoregistro no puede conectar una cuenta de ML que ya
--                           pasó por otra organización (crear correos nuevos es fácil; cuentas de ML con ventas no).
-- Solo agrega: compatible con la versión anterior.
BEGIN;

ALTER TABLE organizaciones ADD COLUMN IF NOT EXISTS origen   TEXT;
ALTER TABLE organizaciones ADD COLUMN IF NOT EXISTS registro JSONB;

CREATE TABLE IF NOT EXISTS ml_pruebas_usadas (
  ml_user_id      BIGINT PRIMARY KEY,
  organizacion_id INTEGER NOT NULL REFERENCES organizaciones(id),
  nickname        TEXT,
  creada_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
GRANT SELECT, INSERT, UPDATE ON ml_pruebas_usadas TO inventory_app;

-- Las cuentas de ML que ya están conectadas hoy (clientes, Fundadores y las propias) no pueden empezar otra prueba.
INSERT INTO ml_pruebas_usadas (ml_user_id, organizacion_id, nickname, creada_at)
SELECT c.ml_user_id, e.organizacion_id, c.nickname, c.created_at
FROM ml_conexiones c JOIN empresas e ON e.id = c.empresa_id
ON CONFLICT (ml_user_id) DO NOTHING;

COMMIT;
