-- 060 · IA más barata y con tope (decidido con el dueño, 2026-10-03).
--
-- * ia_lotes: lotes mandados a la API de lotes de Anthropic (mitad de precio, responde en minutos
--   u horas). Las fichas de conocimiento (lib/fichasIA.ts) van por ahí: nadie espera la respuesta.
--   Un lote abierto por empresa a la vez; datos = {item_id: total de respuestas} para guardar la ficha.
--   POR EMPRESA (empresa_id + RLS empresa_aislada).
-- * empresas.ia_limite_mes: borradores de IA (Preguntas + Mensajes) por mes. Default 200 (mes
--   gratis de los Fundadores); el dueño de la plataforma (organización 'propietario') no tiene
--   límite. Se cambia por empresa en Plataforma → Empresas. NULL = sin límite.
-- Idempotente.
BEGIN;

CREATE TABLE IF NOT EXISTS ia_lotes (
  id            SERIAL  PRIMARY KEY,
  empresa_id    INTEGER NOT NULL DEFAULT NULLIF(current_setting('app.empresa_id', true), '')::int
                  REFERENCES empresas(id),
  batch_id      TEXT    NOT NULL,                 -- msgbatch_…
  modulo        TEXT    NOT NULL,                 -- 'fichas'
  estado        TEXT    NOT NULL DEFAULT 'enviado', -- enviado / terminado
  datos         JSONB,
  creado_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  terminado_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_ia_lotes_abiertos ON ia_lotes (empresa_id, modulo) WHERE estado = 'enviado';

ALTER TABLE ia_lotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE ia_lotes FORCE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
                 WHERE c.relname = 'ia_lotes' AND p.polname = 'empresa_aislada') THEN
    CREATE POLICY empresa_aislada ON ia_lotes
      USING      (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::int)
      WITH CHECK (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::int);
  END IF;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON ia_lotes TO inventory_app;
GRANT USAGE, SELECT ON SEQUENCE ia_lotes_id_seq TO inventory_app;

ALTER TABLE empresas ADD COLUMN IF NOT EXISTS ia_limite_mes INTEGER DEFAULT 200;

COMMIT;
