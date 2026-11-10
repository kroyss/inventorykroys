-- 161 · Comparar con la competencia (10-11-2026, el dueño): preguntas que clientes con bot externo (Mercasist) respondieron
-- fuera del sistema, la respuesta que dio el bot y la que daría NUESTRA IA (sin publicar nada), para que el dueño marque
-- Bien/Mal. GLOBAL y solo del dueño (Plataforma → Interno → Competencia): no la ve ningún cliente.
-- Solo crea una tabla nueva: compatible con la versión anterior. Idempotente.
CREATE TABLE IF NOT EXISTS ia_competencia (
  id                SERIAL PRIMARY KEY,
  empresa_id        INTEGER NOT NULL REFERENCES empresas(id),
  pregunta_id       BIGINT NOT NULL UNIQUE,
  fecha             TIMESTAMPTZ NOT NULL,
  item_id           TEXT,
  item_titulo       TEXT,
  item_permalink    TEXT,
  pregunta          TEXT NOT NULL,
  respuesta_ellos   TEXT,
  segundos          INTEGER,
  respuesta_nuestra TEXT,
  decision          TEXT,
  motivos           JSONB,
  costo             NUMERIC(10,5),
  error             TEXT,
  generada_at       TIMESTAMPTZ,
  marca             TEXT CHECK (marca IN ('bien', 'mal')),
  nota              TEXT,
  marcada_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ia_competencia_empresa ON ia_competencia (empresa_id, fecha DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON ia_competencia TO inventory_app;
GRANT USAGE, SELECT ON SEQUENCE ia_competencia_id_seq TO inventory_app;
