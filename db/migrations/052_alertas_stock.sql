-- 052 · Alertas de stock: lo que queda publicado en MercadoLibre, por publicación y por VARIANTE
-- (color, talla…), leído de TODAS las publicaciones activas o pausadas por falta de stock de cada
-- cuenta conectada (no hace falta tener el código ML cargado en el producto). Para todas las
-- empresas con cuentas conectadas. Se revisa una vez por hora por cuenta (cron de preguntas).
--
-- POR EMPRESA (empresa_id + RLS empresa_aislada + FK compuesta). Idempotente.
BEGIN;

CREATE TABLE IF NOT EXISTS ml_stock_alertas (
  empresa_id        INTEGER NOT NULL DEFAULT NULLIF(current_setting('app.empresa_id', true), '')::int
                      REFERENCES empresas(id),
  item_id           TEXT    NOT NULL,              -- MLV…
  variante_id       BIGINT  NOT NULL DEFAULT 0,    -- 0 = publicación sin variantes
  conexion_id       INTEGER NOT NULL,
  titulo            TEXT    NOT NULL,
  variante          TEXT,                          -- "Color: Negro · Talla: M"
  disponible        INTEGER NOT NULL,
  estado            TEXT,                          -- active / paused
  permalink         TEXT,
  imagen            TEXT,
  agotada_desde     TIMESTAMPTZ,                   -- en 0 desde (NULL = tiene stock)
  bajo_desde        TIMESTAMPTZ,                   -- bajo el límite desde (NULL = no está bajo)
  ultima_agotada_at TIMESTAMPTZ,                   -- última vez que estuvo en 0 (para "últimos 7 días")
  actualizado_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (empresa_id, item_id, variante_id),
  FOREIGN KEY (empresa_id, conexion_id) REFERENCES ml_conexiones (empresa_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_ml_stock_alertas_disp ON ml_stock_alertas (empresa_id, disponible);

ALTER TABLE ml_stock_alertas ENABLE ROW LEVEL SECURITY;
ALTER TABLE ml_stock_alertas FORCE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
                 WHERE c.relname = 'ml_stock_alertas' AND p.polname = 'empresa_aislada') THEN
    CREATE POLICY empresa_aislada ON ml_stock_alertas
      USING      (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::int)
      WITH CHECK (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::int);
  END IF;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON ml_stock_alertas TO inventory_app;

-- Cuándo se revisó por última vez el stock de cada cuenta (una vez por hora).
ALTER TABLE ml_conexiones ADD COLUMN IF NOT EXISTS stock_alertas_at TIMESTAMPTZ;

COMMIT;
