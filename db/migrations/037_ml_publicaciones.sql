-- 037 · Stock en MercadoLibre vs inventario (Automatizaciones → Stock en ML).
--
-- Una fila por publicación de ML vinculada a un producto (product_ml_codes): stock publicado
-- (available_quantity), estado (active / paused / closed…), vendidos y precio. La llena el
-- cron de a poco (cada publicación se refresca cada ~6 h) y el botón Actualizar. Con esto se
-- compara el stock real contra lo publicado en cada cuenta.
--
-- POR EMPRESA (empresa_id + RLS empresa_aislada + FK compuestas). Idempotente.
BEGIN;

CREATE TABLE IF NOT EXISTS ml_publicaciones (
  item_id        TEXT    NOT NULL,                -- MLV768007052
  empresa_id     INTEGER NOT NULL DEFAULT NULLIF(current_setting('app.empresa_id', true), '')::int
                   REFERENCES empresas(id),
  conexion_id    INTEGER NOT NULL,
  product_id     INTEGER NOT NULL,
  cuenta         TEXT,                            -- nombre de la cuenta en el producto (PIKEKE…)
  disponible     INTEGER,                         -- available_quantity
  estado         TEXT,                            -- active / paused / closed / under_review…
  vendidos       INTEGER,
  precio         NUMERIC(14,2),
  moneda         TEXT,
  error          TEXT,                            -- si ML no la dejó leer
  actualizado_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (empresa_id, item_id),
  FOREIGN KEY (empresa_id, conexion_id) REFERENCES ml_conexiones (empresa_id, id) ON DELETE CASCADE,
  FOREIGN KEY (empresa_id, product_id)  REFERENCES products (empresa_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_ml_publicaciones_producto ON ml_publicaciones (empresa_id, product_id);

ALTER TABLE ml_publicaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE ml_publicaciones FORCE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
                 WHERE c.relname = 'ml_publicaciones' AND p.polname = 'empresa_aislada') THEN
    CREATE POLICY empresa_aislada ON ml_publicaciones
      USING      (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::int)
      WITH CHECK (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::int);
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON ml_publicaciones TO inventory_app;

COMMIT;
