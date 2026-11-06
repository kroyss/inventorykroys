-- 146 · Lo que se ve en las fotos de cada publicación, leído UNA vez por la IA (06-11-2026, pedido del dueño).
-- La IA de Preguntas y Mensajes mira las fotos (máx. 6) junto con la ficha y la descripción, guarda en texto lo que
-- se ve (textos impresos en caja/etiqueta, qué trae, conectores…) y las contradicciones de la publicación.
-- Después solo lee ese texto. Se vuelve a leer únicamente si cambia la "huella" (ficha + descripción + fotos).
-- Solo publicaciones donde se usa la IA. Módulo `fotos_ia`: solo SolucionesMC (empresa 1) por ahora.
-- Tabla por empresa (RLS). Solo agrega: compatible con la versión anterior. Idempotente.
BEGIN;

CREATE TABLE IF NOT EXISTS ml_item_fotos_ia (
  empresa_id      INTEGER NOT NULL DEFAULT NULLIF(current_setting('app.empresa_id', true), '')::int REFERENCES empresas(id),
  item_id         TEXT NOT NULL,
  huella          TEXT NOT NULL,              -- sha1 de ficha + descripción + ids de las fotos
  texto           TEXT,                       -- lo que se ve en las fotos (viñetas)
  contradicciones TEXT,                       -- fotos / ficha / descripción que no coinciden, o NULL
  fotos           INTEGER NOT NULL DEFAULT 0,
  modelo          TEXT,
  costo           NUMERIC(10, 5),
  leido_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (empresa_id, item_id)
);
CREATE INDEX IF NOT EXISTS idx_ml_item_fotos_ia_contra ON ml_item_fotos_ia (empresa_id) WHERE contradicciones IS NOT NULL;

ALTER TABLE ml_item_fotos_ia ENABLE ROW LEVEL SECURITY;
ALTER TABLE ml_item_fotos_ia FORCE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
                 WHERE c.relname = 'ml_item_fotos_ia' AND p.polname = 'empresa_aislada') THEN
    CREATE POLICY empresa_aislada ON ml_item_fotos_ia
      USING      (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::int)
      WITH CHECK (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::int);
  END IF;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON ml_item_fotos_ia TO inventory_app;

UPDATE empresas SET modulos = array_append(modulos, 'fotos_ia') WHERE id = 1 AND NOT ('fotos_ia' = ANY (modulos));

COMMIT;
