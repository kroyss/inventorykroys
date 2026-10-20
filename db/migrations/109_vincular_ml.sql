-- 109 · Vincular publicaciones de ML (20-10): un empleado une cada publicación (o variante) con su producto,
-- a mano y de a una (nada automático, decisión del dueño). Pantalla /vincular-ml (lib/vincularML.ts).
--   product_ml_codes: quién vinculó / desvinculó y cuándo (para revisar).
--   ml_vinculo_dudas: lo que el empleado no sabe ("No sé, para Marcos"), con su nota, hasta que el dueño lo resuelve.
--   Permiso nuevo 'vincular_ml' (lib/permisos.ts, encendido por defecto): se agrega también a los empleados que ya
--   tenían su lista de permisos guardada, en las empresas con Inventario (pedido del dueño: "todos tendrían permiso").
-- Solo agrega: compatible con la versión anterior.
BEGIN;

ALTER TABLE product_ml_codes ADD COLUMN IF NOT EXISTS vinculado_por    INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE product_ml_codes ADD COLUMN IF NOT EXISTS vinculado_at     TIMESTAMPTZ;
ALTER TABLE product_ml_codes ADD COLUMN IF NOT EXISTS desvinculado_por INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE product_ml_codes ADD COLUMN IF NOT EXISTS desvinculado_at  TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS ml_vinculo_dudas (
  id           SERIAL PRIMARY KEY,
  empresa_id   INTEGER NOT NULL DEFAULT NULLIF(current_setting('app.empresa_id', true), '')::int REFERENCES empresas(id),
  codigo       TEXT NOT NULL,            -- "768007052" o "768007052:180012345" (sin prefijo, como product_ml_codes)
  cuenta       TEXT,
  titulo       TEXT,
  variante     TEXT,
  nota         TEXT NOT NULL,
  por          INTEGER REFERENCES users(id) ON DELETE SET NULL,
  creada_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resuelta_at  TIMESTAMPTZ,
  resuelta_por INTEGER REFERENCES users(id) ON DELETE SET NULL,
  resolucion   TEXT                      -- 'vinculada' / 'ignorada'
);
CREATE INDEX IF NOT EXISTS idx_ml_vinculo_dudas ON ml_vinculo_dudas (empresa_id, codigo) WHERE resuelta_at IS NULL;

ALTER TABLE ml_vinculo_dudas ENABLE ROW LEVEL SECURITY;
ALTER TABLE ml_vinculo_dudas FORCE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
                 WHERE c.relname = 'ml_vinculo_dudas' AND p.polname = 'empresa_aislada') THEN
    CREATE POLICY empresa_aislada ON ml_vinculo_dudas
      USING      (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::int)
      WITH CHECK (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::int);
  END IF;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON ml_vinculo_dudas TO inventory_app;
GRANT USAGE, SELECT ON SEQUENCE ml_vinculo_dudas_id_seq TO inventory_app;

-- El permiso a los empleados con permisos ya guardados (los que nunca se tocaron lo reciben por defecto).
UPDATE usuario_empresas ue SET permisos = array_append(ue.permisos, 'vincular_ml')
FROM empresas e
WHERE e.id = ue.empresa_id AND 'inventario' = ANY(e.modulos)
  AND ue.role <> 'admin' AND ue.permisos IS NOT NULL AND NOT ('vincular_ml' = ANY(ue.permisos));

COMMIT;
