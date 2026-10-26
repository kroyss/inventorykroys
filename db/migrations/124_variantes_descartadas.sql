-- 124 · Variantes descartadas en Vincular con ML (26-10, pedido del dueño).
--   Variantes viejas que quedaron en una publicación (p. ej. "Negro" después de separar en "Negro - corto/largo"):
--   'no_usa'   → la persona la marca "No se usa": sale de "Por vincular" (se deshace borrando la fila);
--   'eliminada'→ se eliminó la variante en MercadoLibre desde el sistema (registro de quién y cuándo).
--   Nada automático: siempre lo decide una persona.
-- Solo agrega: compatible con la versión anterior.
BEGIN;

CREATE TABLE IF NOT EXISTS ml_variantes_descartadas (
  id         SERIAL PRIMARY KEY,
  empresa_id INTEGER NOT NULL DEFAULT NULLIF(current_setting('app.empresa_id', true), '')::int REFERENCES empresas(id),
  codigo     TEXT NOT NULL,            -- "722737654:175372104106" (sin prefijo, como product_ml_codes)
  cuenta     TEXT,
  titulo     TEXT,
  variante   TEXT,
  motivo     TEXT NOT NULL CHECK (motivo IN ('no_usa', 'eliminada')),
  por        INTEGER REFERENCES users(id) ON DELETE SET NULL,
  creada_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ml_variantes_descartadas ON ml_variantes_descartadas (empresa_id, codigo, motivo);

ALTER TABLE ml_variantes_descartadas ENABLE ROW LEVEL SECURITY;
ALTER TABLE ml_variantes_descartadas FORCE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
                 WHERE c.relname = 'ml_variantes_descartadas' AND p.polname = 'empresa_aislada') THEN
    CREATE POLICY empresa_aislada ON ml_variantes_descartadas
      USING      (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::int)
      WITH CHECK (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::int);
  END IF;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON ml_variantes_descartadas TO inventory_app;
GRANT USAGE, SELECT ON SEQUENCE ml_variantes_descartadas_id_seq TO inventory_app;

COMMIT;
