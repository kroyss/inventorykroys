-- 192 (20-11-2026, el dueño, idea vista en Mercasist): VISITAS de cada publicación en los últimos 30 días, para
-- Inventario → Publicaciones (columna y filtro «Muchas visitas, pocas ventas»).
--   · ml_catalogo.visitas_30d / ventas_30d / visitas_at: lo trae lib/visitasML.ts una vez al día por cuenta, al final
--     de la pasada del catálogo (lib/catalogoML.ts). ventas_30d sale de ml_ordenes (sin llamar a ML).
--   · ml_conexiones.visitas_at: cuándo se trajeron por última vez las de esa cuenta (reserva atómica, 1 vez por día).
-- Solo agrega columnas (compatible con la versión anterior). Idempotente.
BEGIN;

ALTER TABLE ml_catalogo   ADD COLUMN IF NOT EXISTS visitas_30d INTEGER;
ALTER TABLE ml_catalogo   ADD COLUMN IF NOT EXISTS ventas_30d  INTEGER;
ALTER TABLE ml_catalogo   ADD COLUMN IF NOT EXISTS visitas_at  TIMESTAMPTZ;
ALTER TABLE ml_conexiones ADD COLUMN IF NOT EXISTS visitas_at  TIMESTAMPTZ;

COMMIT;
