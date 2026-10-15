-- 089: Avisos por Telegram (2026-10-14). lib/avisosTelegram.ts · lib/telegram.ts
--
-- El bot (@ComercianteDigitalAvisosBot, token en TELEGRAM_BOT_TOKEN) le escribe SOLO a quien lo
-- conectó desde "Mis avisos" (deep link t.me/<bot>?start=CODIGO). Avisa lo que la app de
-- MercadoLibre no avisa: cuenta desconectada, pregunta o mensaje sin responder pasado un rato,
-- calificación negativa recibida y un resumen diario.
--
-- Tablas GLOBALES (como users / usuario_empresas): se leen y escriben con dbGlobal() y siempre
-- filtradas por user_id / empresa_id en el código. Nada de datos del negocio: el chat de
-- Telegram de cada usuario y qué aviso ya se le mandó (tipo + referencia).
-- Idempotente y compatible con la versión anterior (solo agrega).
BEGIN;

-- Un Telegram por persona (users es global: una cuenta por persona).
CREATE TABLE IF NOT EXISTS telegram_usuarios (
  user_id        INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  chat_id        BIGINT,                 -- NULL = no conectado (o se desconectó / bloqueó el bot)
  tg_usuario     TEXT,                   -- @usuario de Telegram (si tiene)
  tg_nombre      TEXT,
  -- staging y producción comparten el bot: cada uno manda solo a los que se conectaron EN ÉL
  -- (staging copia la base de producción y si no, mandaría todo dos veces).
  entorno        TEXT NOT NULL DEFAULT 'produccion',
  codigo         TEXT,                   -- código de un solo uso del link de conexión
  codigo_expira  TIMESTAMPTZ,
  vinculado_at   TIMESTAMPTZ,
  error          TEXT,                   -- último error al mandar (p. ej. bloqueó el bot)
  actualizado_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS telegram_usuarios_codigo ON telegram_usuarios (codigo) WHERE codigo IS NOT NULL;

-- Qué quiere recibir cada persona EN CADA EMPRESA (NULL = los predeterminados, lib/avisosTelegram.ts).
ALTER TABLE usuario_empresas ADD COLUMN IF NOT EXISTS avisos JSONB;

-- Avisos ya mandados (no repetir). Se limpian solos a los 30 días.
CREATE TABLE IF NOT EXISTS avisos_enviados (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  tipo       TEXT NOT NULL,              -- desconectada / pregunta / mensaje / negativa / neutral / resumen
  ref        TEXT NOT NULL,              -- id de la pregunta, pack+fecha del mensaje, orden, día…
  enviado_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, empresa_id, tipo, ref)
);
CREATE INDEX IF NOT EXISTS avisos_enviados_fecha ON avisos_enviados (enviado_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON telegram_usuarios, avisos_enviados TO inventory_app;

COMMIT;
