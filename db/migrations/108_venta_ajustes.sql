-- 108 · Corregir pedido (20-10): cambios de última hora sobre una venta ya procesada (el cliente cambió de
-- color, se agregó algo, error al procesar). Se corrige la MISMA venta y el inventario se ajusta por la
-- diferencia; aquí queda la nota: antes / después, quién, cuándo y por qué.
--   antes / despues: [{ product_id, nombre, cantidad, precio }]
--   despues_de_enviado: el paquete ya había salido (jornada cerrada) cuando se corrigió.
--   factura: número de la factura emitida que quedó desactualizada (se corrige en Facturas).
-- POR EMPRESA (empresa_id + RLS empresa_aislada + FK compuesta). Solo agrega una tabla: compatible.
BEGIN;

CREATE TABLE IF NOT EXISTS venta_ajustes (
  id                 SERIAL PRIMARY KEY,
  empresa_id         INTEGER NOT NULL DEFAULT NULLIF(current_setting('app.empresa_id', true), '')::int
                       REFERENCES empresas(id),
  sale_id            INTEGER NOT NULL,
  fecha              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  por                INTEGER REFERENCES users(id) ON DELETE SET NULL,
  motivo             TEXT NOT NULL,
  antes              JSONB NOT NULL,
  despues            JSONB NOT NULL,
  total_antes        NUMERIC(14,2),
  total_despues      NUMERIC(14,2),
  despues_de_enviado BOOLEAN NOT NULL DEFAULT FALSE,
  factura            TEXT,
  FOREIGN KEY (empresa_id, sale_id) REFERENCES sales (empresa_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_venta_ajustes_sale ON venta_ajustes (empresa_id, sale_id, fecha);

ALTER TABLE venta_ajustes ENABLE ROW LEVEL SECURITY;
ALTER TABLE venta_ajustes FORCE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
                 WHERE c.relname = 'venta_ajustes' AND p.polname = 'empresa_aislada') THEN
    CREATE POLICY empresa_aislada ON venta_ajustes
      USING      (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::int)
      WITH CHECK (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::int);
  END IF;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON venta_ajustes TO inventory_app;
GRANT USAGE, SELECT ON SEQUENCE venta_ajustes_id_seq TO inventory_app;

COMMIT;
