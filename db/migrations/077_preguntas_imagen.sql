-- 077: miniatura de la publicación en Preguntas (2026-10-10). La trae completarItems (lib/preguntas.ts)
-- con el resto de los datos del ítem (`thumbnail` de /items/{id}); se muestra junto al título para
-- distinguir publicaciones con títulos parecidos. Vacío = todavía no se leyó o ML no la dio.
-- Idempotente. Primero staging, después producción.

ALTER TABLE ml_preguntas ADD COLUMN IF NOT EXISTS item_imagen text;
