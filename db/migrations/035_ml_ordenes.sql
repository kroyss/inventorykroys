-- 035 · Ventas de MercadoLibre (para calificar en bloque: Automatizaciones → Calificaciones).
--
-- Copia liviana de las órdenes de las cuentas conectadas de los últimos ~90 días: quién
-- compró, qué, y si ya hay calificación del vendedor / del comprador. Se cruza con `sales`
-- (ml_order_number) para saber si la venta se concretó en el sistema y sugerir la
-- calificación. La llena la sincronización (cron, cada ~30 min) y el botón Actualizar.
--
-- POR EMPRESA (empresa_id + RLS empresa_aislada + FK compuesta). Idempotente.
BEGIN;

CREATE TABLE IF NOT EXISTS ml_ordenes (
  id                BIGINT  NOT NULL,              -- número de venta de ML
  empresa_id        INTEGER NOT NULL DEFAULT NULLIF(current_setting('app.empresa_id', true), '')::int
                      REFERENCES empresas(id),
  conexion_id       INTEGER NOT NULL,
  pack_id           BIGINT,
  fecha             TIMESTAMPTZ NOT NULL,
  comprador         TEXT,                          -- nickname
  productos         TEXT,
  total             NUMERIC(14,2),
  moneda            TEXT,
  cal_vendedor      TEXT,                          -- positive / neutral / negative (NULL = sin calificar)
  cal_concretada    BOOLEAN,
  cal_comprador     TEXT,
  actualizada_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (empresa_id, id),
  FOREIGN KEY (empresa_id, conexion_id) REFERENCES ml_conexiones (empresa_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_ml_ordenes_pendientes ON ml_ordenes (empresa_id, fecha DESC) WHERE cal_vendedor IS NULL;

ALTER TABLE ml_conexiones ADD COLUMN IF NOT EXISTS ordenes_sync_at TIMESTAMPTZ;

ALTER TABLE ml_ordenes ENABLE ROW LEVEL SECURITY;
ALTER TABLE ml_ordenes FORCE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
                 WHERE c.relname = 'ml_ordenes' AND p.polname = 'empresa_aislada') THEN
    CREATE POLICY empresa_aislada ON ml_ordenes
      USING      (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::int)
      WITH CHECK (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::int);
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON ml_ordenes TO inventory_app;

COMMIT;
