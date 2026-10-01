-- 034 · Mensajes post-venta de MercadoLibre (bandeja en Automatizaciones → Mensajes).
--
-- Una fila por conversación de venta (pack). La llena la sincronización (cron de cada
-- minuto) con GET /messages/unread?role=seller&tag=post_sale: cuántos mensajes sin leer
-- tiene y el último mensaje, para que nadie se quede sin respuesta. Los mensajes en sí no
-- se guardan: se leen de ML al abrir la conversación (siempre al día).
--
-- POR EMPRESA (empresa_id + RLS empresa_aislada + FK compuesta). Idempotente.
-- Se corre como postgres en inventory_db / inventory (primero staging).
BEGIN;

CREATE TABLE IF NOT EXISTS ml_conversaciones (
  pack_id            BIGINT  NOT NULL,       -- pack de ML (si la venta no tiene pack, = número de venta)
  empresa_id         INTEGER NOT NULL DEFAULT NULLIF(current_setting('app.empresa_id', true), '')::int
                       REFERENCES empresas(id),
  conexion_id        INTEGER NOT NULL,
  sin_leer           INTEGER NOT NULL DEFAULT 0,
  ultimo_texto       TEXT,
  ultimo_de_comprador BOOLEAN,
  ultimo_at          TIMESTAMPTZ,
  comprador_id       BIGINT,
  productos          TEXT,                   -- títulos de la venta (se completan una vez)
  actualizada_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (empresa_id, pack_id),
  FOREIGN KEY (empresa_id, conexion_id) REFERENCES ml_conexiones (empresa_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_ml_conversaciones_bandeja ON ml_conversaciones (empresa_id, sin_leer DESC, ultimo_at DESC);

ALTER TABLE ml_conversaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE ml_conversaciones FORCE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
                 WHERE c.relname = 'ml_conversaciones' AND p.polname = 'empresa_aislada') THEN
    CREATE POLICY empresa_aislada ON ml_conversaciones
      USING      (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::int)
      WITH CHECK (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::int);
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON ml_conversaciones TO inventory_app;

COMMIT;
