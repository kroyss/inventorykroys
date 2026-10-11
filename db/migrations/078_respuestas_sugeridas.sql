-- 078 · Respuestas sugeridas SIN IA en Preguntas (decidido con el dueño, 2026-10-11).
--
-- * respuestas_origen.plantilla / item_id: qué respuesta rápida se usó y en qué publicación, para el
--   contador "usos sin cambios" de cada una (camino al automático) y el aprendizaje por producto.
--   fuente 'sugerida' = enviada desde la bandeja "Sugeridas".
-- * ml_item_hechos: lo que el sistema aprendió de cada publicación con los clics del vendedor:
--     envio_gratis TRUE  → envió sin cambios una respuesta de envío gratis en ella (confirmado);
--     envio_gratis FALSE → respondió "por unidad no tiene envío gratis" (o similar): no se sugiere más;
--     precio_ref         → precio al aprenderlo (si cambia mucho, se vuelve a confirmar).
--   Visible y corregible en Preguntas → Configuración.
--
-- POR EMPRESA (empresa_id + RLS empresa_aislada). Idempotente. Primero staging, después producción.
BEGIN;

ALTER TABLE respuestas_origen ADD COLUMN IF NOT EXISTS plantilla TEXT;
ALTER TABLE respuestas_origen ADD COLUMN IF NOT EXISTS item_id   TEXT;
CREATE INDEX IF NOT EXISTS idx_respuestas_origen_plantilla ON respuestas_origen (empresa_id, plantilla) WHERE plantilla IS NOT NULL;

CREATE TABLE IF NOT EXISTS ml_item_hechos (
  empresa_id    INTEGER NOT NULL DEFAULT NULLIF(current_setting('app.empresa_id', true), '')::int
                  REFERENCES empresas(id),
  item_id       TEXT    NOT NULL,                  -- MLV…
  envio_gratis  BOOLEAN,                           -- NULL = no se sabe
  fuente        TEXT,                              -- clic (envió la sugerencia) / respuesta (lo dijo) / manual
  precio_ref    NUMERIC(14,2),
  actualizado_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (empresa_id, item_id)
);

ALTER TABLE ml_item_hechos ENABLE ROW LEVEL SECURITY;
ALTER TABLE ml_item_hechos FORCE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
                 WHERE c.relname = 'ml_item_hechos' AND p.polname = 'empresa_aislada') THEN
    CREATE POLICY empresa_aislada ON ml_item_hechos
      USING      (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::int)
      WITH CHECK (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::int);
  END IF;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON ml_item_hechos TO inventory_app;

-- Lo que ya se sabe del historial: publicaciones donde el vendedor respondió que NO tienen envío
-- gratis (por unidad, por peso…). Para cada empresa.
INSERT INTO ml_item_hechos (empresa_id, item_id, envio_gratis, fuente, precio_ref)
SELECT DISTINCT ON (q.empresa_id, q.item_id) q.empresa_id, q.item_id, FALSE, 'respuesta', q.item_precio
FROM ml_preguntas q
WHERE lower(q.respuesta) ~ '(no tiene (opcion|opción) de env|por unidad no|no aplica (el )?env|no califica (para|al) env|no tiene env[ií]o gratis)'
ORDER BY q.empresa_id, q.item_id, q.respuesta_fecha DESC NULLS LAST
ON CONFLICT (empresa_id, item_id) DO NOTHING;

COMMIT;
