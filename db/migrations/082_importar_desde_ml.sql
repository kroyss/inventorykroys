-- 082: Importar productos desde MercadoLibre (2026-10-12, Productos → Primeros pasos).
--
-- * ml_catalogo: foto, SKU del vendedor y variantes de cada publicación (las trae el mismo refresco
--   del catálogo de lib/catalogoML.ts, sin llamadas nuevas a ML). variantes = [{id, nombre, disponible, sku}].
-- * products.stock_por_verificar: el stock inicial vino de lo que ML dice que hay; queda marcado
--   hasta que alguien lo confirme o lo corrija (decisión del dueño: "deben revisar producto por producto").
--
-- Códigos ML por variante: product_ml_codes.ml_code puede ser "768007052:180012345" (publicación:variante)
-- además del de siempre "768007052". No cambia la tabla; lo entienden Ventas, Por confirmar y Preguntas.
-- Idempotente.

ALTER TABLE ml_catalogo ADD COLUMN IF NOT EXISTS thumbnail TEXT;
ALTER TABLE ml_catalogo ADD COLUMN IF NOT EXISTS sku       TEXT;
ALTER TABLE ml_catalogo ADD COLUMN IF NOT EXISTS variantes JSONB;

ALTER TABLE products ADD COLUMN IF NOT EXISTS stock_por_verificar BOOLEAN NOT NULL DEFAULT FALSE;

-- "Se parece a uno tuyo": nombres parecidos por trigramas con índice (sin él, 500 publicaciones contra
-- 500 productos tardaban ~3 s).
CREATE INDEX IF NOT EXISTS idx_products_name_trgm ON products USING gin (name gin_trgm_ops);
