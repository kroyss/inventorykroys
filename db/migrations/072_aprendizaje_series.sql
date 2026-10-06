-- 072 · Aprendizaje en dos series + duración de cada video.
--   serie 'automatizaciones' → la ven TODAS las empresas (es el arranque de todo cliente).
--   serie 'inventario'       → solo las empresas con el módulo inventario encendido.
-- El orden "no puedes ver el 3 sin completar el 2" es DENTRO de cada serie.
-- duracion_seg: la que se muestra en la lista (la carga el dueño; si falta, la completa el
-- reproductor la primera vez que alguien lo abre). Idempotente.
BEGIN;

ALTER TABLE aprendizaje_videos ADD COLUMN IF NOT EXISTS serie TEXT NOT NULL DEFAULT 'automatizaciones';
ALTER TABLE aprendizaje_videos ADD COLUMN IF NOT EXISTS duracion_seg INTEGER;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'aprendizaje_videos_serie_check') THEN
    ALTER TABLE aprendizaje_videos ADD CONSTRAINT aprendizaje_videos_serie_check CHECK (serie IN ('automatizaciones', 'inventario'));
  END IF;
END $$;

-- Duraciones de los 7 videos de Automatizaciones (YouTube, 06-10-2026), solo si no tienen.
UPDATE aprendizaje_videos v SET duracion_seg = d.seg
FROM (VALUES ('P-8IRMaICXI', 116), ('NWHGAKiRUdA', 91), ('AoY1I0dyFWg', 631), ('RVAzCq1FcZk', 303),
             ('4lR3iZHVAp8', 461), ('aEY-ypYpT58', 301), ('lMj0ptHUCGE', 372)) AS d(yt, seg)
WHERE v.youtube_id = d.yt AND v.duracion_seg IS NULL;

COMMIT;
