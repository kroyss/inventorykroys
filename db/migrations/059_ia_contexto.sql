-- 059 · Más contexto para la IA de Preguntas y Mensajes (decidido con el dueño, 2026-10-03).
--
-- * ml_catalogo: TODAS las publicaciones activas/pausadas de cada cuenta (título, precio, categoría,
--   stock, link y un resumen de la ficha técnica). Para que la IA pueda recomendar OTRO modelo del
--   vendedor ("este no se empareja; el PRO sí: <link>"). Lo refresca el cron cada 6 h por cuenta.
--   historial_at = ya se trajo de ML todo el historial de preguntas respondidas de esa publicación
--   (la búsqueda general de ML corta en 1.000; por publicación se llega a todo).
--   ficha_pedida_at = reserva para no generar dos veces la misma ficha a la vez.
-- * ml_item_fichas: "ficha de conocimiento" por publicación: lo que el vendedor ya respondió,
--   resumido por la IA en datos confirmados (pocas líneas = mucho contexto con pocos tokens).
-- * Índice de texto (español) en ml_preguntas para encontrar preguntas parecidas por sus palabras
--   aunque estén escritas distinto (complementa la similitud por trigramas).
--
-- POR EMPRESA (empresa_id + RLS empresa_aislada + FK compuesta). Idempotente.
BEGIN;

CREATE TABLE IF NOT EXISTS ml_catalogo (
  empresa_id      INTEGER NOT NULL DEFAULT NULLIF(current_setting('app.empresa_id', true), '')::int
                    REFERENCES empresas(id),
  item_id         TEXT    NOT NULL,              -- MLV…
  conexion_id     INTEGER NOT NULL,
  titulo          TEXT    NOT NULL,
  precio          NUMERIC(14,2),
  moneda          TEXT,
  category_id     TEXT,
  disponible      INTEGER NOT NULL DEFAULT 0,
  estado          TEXT,                          -- active / paused
  permalink       TEXT,
  ficha           TEXT,                          -- "Marca: X · Modelo: Y · …" (atributos con valor)
  actualizado_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  historial_at    TIMESTAMPTZ,
  ficha_pedida_at TIMESTAMPTZ,
  PRIMARY KEY (empresa_id, item_id),
  FOREIGN KEY (empresa_id, conexion_id) REFERENCES ml_conexiones (empresa_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_ml_catalogo_categoria ON ml_catalogo (empresa_id, category_id);
CREATE INDEX IF NOT EXISTS idx_ml_catalogo_titulo ON ml_catalogo USING gin (titulo gin_trgm_ops);

CREATE TABLE IF NOT EXISTS ml_item_fichas (
  empresa_id   INTEGER NOT NULL DEFAULT NULLIF(current_setting('app.empresa_id', true), '')::int
                 REFERENCES empresas(id),
  item_id      TEXT    NOT NULL,
  texto        TEXT    NOT NULL,                 -- datos confirmados por el vendedor (viñetas cortas)
  dudas        TEXT,                             -- contradicciones encontradas (para revisar)
  n_preguntas  INTEGER NOT NULL DEFAULT 0,       -- respondidas que se usaron (para saber cuándo rehacerla)
  generada_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (empresa_id, item_id)
);

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['ml_catalogo', 'ml_item_fichas'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
                   WHERE c.relname = t AND p.polname = 'empresa_aislada') THEN
      EXECUTE format($p$CREATE POLICY empresa_aislada ON %I
        USING      (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::int)
        WITH CHECK (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::int)$p$, t);
    END IF;
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO inventory_app', t);
  END LOOP;
END $$;

ALTER TABLE ml_conexiones ADD COLUMN IF NOT EXISTS catalogo_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_ml_preguntas_texto_es ON ml_preguntas USING gin (to_tsvector('spanish', texto));

COMMIT;
