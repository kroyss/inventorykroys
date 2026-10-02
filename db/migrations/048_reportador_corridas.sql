-- 048 · Reportador por API en SEGUNDO PLANO: cada corrida (reportar o vista previa) la hace el
-- servidor de principio a fin, aunque se cierre la pantalla o se bloquee el teléfono. Antes la
-- pantalla pedía cada lote y, si se cerraba, el reporte se quedaba a medias.
--
-- Una fila por corrida: avance (procesados), "latido" para saber si sigue viva (si el servidor se
-- reinicia, deja de latir y se marca interrumpida) y pedido de detener. Una sola corriendo por empresa.
--
-- POR EMPRESA (empresa_id + RLS empresa_aislada). Idempotente.
BEGIN;

CREATE TABLE IF NOT EXISTS reportador_corridas (
  id           SERIAL  PRIMARY KEY,
  empresa_id   INTEGER NOT NULL DEFAULT NULLIF(current_setting('app.empresa_id', true), '')::int
                 REFERENCES empresas(id),
  simular      BOOLEAN NOT NULL,                 -- TRUE = vista previa (no envía nada)
  estado       TEXT    NOT NULL DEFAULT 'corriendo',
  total        INTEGER NOT NULL DEFAULT 0,       -- pendientes al empezar
  procesados   JSONB   NOT NULL DEFAULT '[]',    -- resultado de cada envío (lib/reportadorApi.ts)
  parar        BOOLEAN NOT NULL DEFAULT FALSE,   -- pedido de detener (se mira entre lotes)
  error        TEXT,
  iniciada_por INTEGER REFERENCES users(id),
  started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  latido_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at  TIMESTAMPTZ,
  CONSTRAINT reportador_corridas_estado_check
    CHECK (estado IN ('corriendo', 'terminada', 'detenida', 'interrumpida', 'error'))
);
CREATE INDEX IF NOT EXISTS idx_reportador_corridas ON reportador_corridas (empresa_id, id DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_reportador_corrida_activa ON reportador_corridas (empresa_id)
  WHERE estado = 'corriendo';

ALTER TABLE reportador_corridas ENABLE ROW LEVEL SECURITY;
ALTER TABLE reportador_corridas FORCE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
                 WHERE c.relname = 'reportador_corridas' AND p.polname = 'empresa_aislada') THEN
    CREATE POLICY empresa_aislada ON reportador_corridas
      USING      (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::int)
      WITH CHECK (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::int);
  END IF;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON reportador_corridas TO inventory_app;
GRANT USAGE, SELECT ON SEQUENCE reportador_corridas_id_seq TO inventory_app;

COMMIT;
