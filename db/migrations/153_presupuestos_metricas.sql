-- 153 · Presupuestos y Métricas (08-11-2026, decisión del dueño después del análisis de Mercasist).
--   - presupuestos: cotización imprimible (cliente, productos o ítems libres, validez). Aceptado → venta BORRADOR
--     LOCAL (sale_id). Ítems en JSONB: [{ product_id | null, descripcion, cantidad, precio }].
--   - Módulos `presupuestos` (Ventas → Presupuestos) y `metricas` (Reportes → Resumen): solo SolucionesMC por ahora.
-- Tabla por empresa (RLS). Solo agrega: compatible con la versión anterior. Idempotente.
BEGIN;

CREATE TABLE IF NOT EXISTS presupuestos (
  id              BIGSERIAL,
  empresa_id      INTEGER NOT NULL DEFAULT NULLIF(current_setting('app.empresa_id', true), '')::int REFERENCES empresas(id),
  numero          INTEGER NOT NULL,
  cliente         TEXT    NOT NULL,
  cliente_doc     TEXT,                         -- cédula / RIF / NIT
  cliente_contacto TEXT,                        -- teléfono o correo
  items           JSONB   NOT NULL DEFAULT '[]',
  descuento       NUMERIC(5,2) NOT NULL DEFAULT 0,
  total           NUMERIC(14,2) NOT NULL DEFAULT 0,
  moneda          TEXT    NOT NULL DEFAULT 'USD',
  validez_dias    INTEGER NOT NULL DEFAULT 7,
  notas           TEXT,
  estado          TEXT    NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador', 'enviado', 'aceptado', 'rechazado')),
  sale_id         INTEGER,                      -- la venta creada al aceptarlo
  creado_por      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  creado_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (empresa_id, id),
  UNIQUE (empresa_id, numero)
);
CREATE INDEX IF NOT EXISTS idx_presupuestos_fecha ON presupuestos (empresa_id, creado_at DESC);

ALTER TABLE presupuestos ENABLE ROW LEVEL SECURITY;
ALTER TABLE presupuestos FORCE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid WHERE c.relname = 'presupuestos' AND p.polname = 'empresa_aislada') THEN
    CREATE POLICY empresa_aislada ON presupuestos
      USING      (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::int)
      WITH CHECK (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::int);
  END IF;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON presupuestos TO inventory_app;
GRANT USAGE, SELECT ON SEQUENCE presupuestos_id_seq TO inventory_app;

UPDATE empresas SET modulos = array_append(modulos, 'presupuestos') WHERE id IN (1, 2) AND NOT ('presupuestos' = ANY (modulos));
UPDATE empresas SET modulos = array_append(modulos, 'metricas') WHERE id IN (1, 2) AND NOT ('metricas' = ANY (modulos));

COMMIT;
