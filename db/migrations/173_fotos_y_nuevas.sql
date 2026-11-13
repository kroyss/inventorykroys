-- 173 (13-11-2026, el dueño): fotos de productos en todo el inventario y publicaciones nuevas al abrir Vincular.
-- Solo agrega. Idempotente.

-- Foto propia del producto (subida en Productos). Sin ella se usa la de MercadoLibre (variante → publicación).
ALTER TABLE products ADD COLUMN IF NOT EXISTS foto_path TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS foto_at TIMESTAMPTZ;

-- Cuándo apareció cada publicación en el catálogo (las de antes quedan NULL = viejas): «publicaciones nuevas».
ALTER TABLE ml_catalogo ADD COLUMN IF NOT EXISTS visto_at TIMESTAMPTZ;
ALTER TABLE ml_catalogo ALTER COLUMN visto_at SET DEFAULT NOW();

-- Última búsqueda rápida de publicaciones nuevas por cuenta (a lo sumo cada 5 minutos).
ALTER TABLE ml_conexiones ADD COLUMN IF NOT EXISTS nuevas_at TIMESTAMPTZ;
