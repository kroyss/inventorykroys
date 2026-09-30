-- 033 · Preguntas de MercadoLibre con IA (módulo `preguntas`, espacio Automatizaciones).
--
--   ml_conexiones   → cuentas de MercadoLibre autorizadas por la empresa (OAuth). Los
--                     tokens se guardan CIFRADOS (AES-256-GCM, clave ML_TOKEN_KEY del
--                     servidor, nunca en la base ni en el repo). El refresh token de ML es
--                     de UN SOLO USO: la renovación se serializa con SELECT … FOR UPDATE.
--   ml_preguntas    → bandeja: una fila por pregunta (id = el de ML), con el borrador de la
--                     IA y quién respondió. También guarda las ya respondidas: son el
--                     histórico del que la IA copia el tono y las políticas del vendedor.
--   ml_item_notas   → memoria por publicación: datos que la IA no sabía y el vendedor
--                     escribió a mano (se usan en las próximas preguntas de ese ítem).
--
-- Las tres son POR EMPRESA: empresa_id + RLS `empresa_aislada` + FK compuestas (mismo
-- patrón que db/multiempresa/01_esquema.sql). Idempotente. Se corre como postgres en
-- inventory_db / inventory (primero staging).
BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_trgm;   -- preguntas parecidas del histórico

CREATE TABLE IF NOT EXISTS ml_conexiones (
  id                 SERIAL PRIMARY KEY,
  empresa_id         INTEGER NOT NULL DEFAULT NULLIF(current_setting('app.empresa_id', true), '')::int
                       REFERENCES empresas(id),
  ml_user_id         BIGINT  NOT NULL,
  nickname           TEXT    NOT NULL,
  site_id            TEXT,
  access_token_enc   TEXT    NOT NULL,
  refresh_token_enc  TEXT    NOT NULL,
  expira_en          TIMESTAMPTZ NOT NULL,
  scopes             TEXT,
  estado             TEXT    NOT NULL DEFAULT 'activa' CHECK (estado IN ('activa', 'desconectada')),
  ultimo_error       TEXT,
  ultima_sync        TIMESTAMPTZ,
  conectada_por      INTEGER REFERENCES users(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ml_conexiones_empresa_id_key UNIQUE (empresa_id, id)
);
-- Una cuenta de ML pertenece a UNA empresa (si otra la conecta, se rechaza en la app).
CREATE UNIQUE INDEX IF NOT EXISTS uq_ml_conexiones_user ON ml_conexiones (ml_user_id);
CREATE INDEX IF NOT EXISTS idx_ml_conexiones_empresa ON ml_conexiones (empresa_id);

CREATE TABLE IF NOT EXISTS ml_preguntas (
  id                 BIGINT  NOT NULL,             -- question_id de ML
  empresa_id         INTEGER NOT NULL DEFAULT NULLIF(current_setting('app.empresa_id', true), '')::int
                       REFERENCES empresas(id),
  conexion_id        INTEGER NOT NULL,
  item_id            TEXT    NOT NULL,
  item_titulo        TEXT,
  item_permalink     TEXT,
  item_estado        TEXT,                         -- active / paused / closed…
  texto              TEXT    NOT NULL,
  estado             TEXT    NOT NULL,             -- UNANSWERED, ANSWERED, CLOSED_UNANSWERED…
  fecha              TIMESTAMPTZ NOT NULL,
  comprador_id       BIGINT,
  respuesta          TEXT,
  respuesta_estado   TEXT,                         -- ACTIVE, UNDER_REVIEW, BANNED…
  respuesta_fecha    TIMESTAMPTZ,
  respondida_por     INTEGER REFERENCES users(id), -- NULL = respondida fuera del sistema
  borrador           TEXT,
  borrador_confianza TEXT CHECK (borrador_confianza IN ('alta', 'media', 'baja')),
  borrador_falta     TEXT,                         -- qué dato no encontró la IA
  borrador_web       BOOLEAN NOT NULL DEFAULT FALSE,
  borrador_at        TIMESTAMPTZ,
  sincronizada_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (empresa_id, id),
  FOREIGN KEY (empresa_id, conexion_id) REFERENCES ml_conexiones (empresa_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_ml_preguntas_estado ON ml_preguntas (empresa_id, estado, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_ml_preguntas_item   ON ml_preguntas (empresa_id, item_id);
CREATE INDEX IF NOT EXISTS idx_ml_preguntas_trgm   ON ml_preguntas USING gin (texto gin_trgm_ops);

CREATE TABLE IF NOT EXISTS ml_item_notas (
  id          SERIAL PRIMARY KEY,
  empresa_id  INTEGER NOT NULL DEFAULT NULLIF(current_setting('app.empresa_id', true), '')::int
                REFERENCES empresas(id),
  item_id     TEXT    NOT NULL,
  texto       TEXT    NOT NULL,
  creada_por  INTEGER REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ml_item_notas_empresa_id_key UNIQUE (empresa_id, id)
);
CREATE INDEX IF NOT EXISTS idx_ml_item_notas_item ON ml_item_notas (empresa_id, item_id);

-- RLS: cada empresa ve solo lo suyo (la app entra con inventory_app, que no la salta).
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['ml_conexiones', 'ml_preguntas', 'ml_item_notas'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
                   WHERE c.relname = t AND p.polname = 'empresa_aislada') THEN
      EXECUTE format($f$CREATE POLICY empresa_aislada ON %I
                        USING      (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::int)
                        WITH CHECK (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::int)$f$, t);
    END IF;
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON ml_conexiones, ml_preguntas, ml_item_notas TO inventory_app;
GRANT USAGE, SELECT, UPDATE ON SEQUENCE ml_conexiones_id_seq, ml_item_notas_id_seq TO inventory_app;

COMMIT;
