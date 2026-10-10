-- 077: miniatura de la publicación en Preguntas (2026-10-10). La trae completarItems (lib/preguntas.ts)
-- con el resto de los datos del ítem (`thumbnail` de /items/{id}); se muestra junto al título para
-- distinguir publicaciones con títulos parecidos. Vacío = todavía no se leyó o ML no la dio.
-- Idempotente. Primero staging, después producción.

ALTER TABLE ml_preguntas ADD COLUMN IF NOT EXISTS item_imagen text;

-- Cuántas variantes tiene la publicación (0 = ninguna): muestra "Ver variantes" junto al título; el
-- detalle (combinación y stock de cada una) se lee de ML al abrirlo.
ALTER TABLE ml_preguntas ADD COLUMN IF NOT EXISTS item_variantes integer;
