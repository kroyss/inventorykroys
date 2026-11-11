-- 166 · Video de Aprendizaje reemplazado por una versión nueva (12-11-2026, el dueño): al cambiar el link con «Es una
-- versión nueva» se reinicia el visto a todos y el video vuelve a mostrar «Nuevo» 14 días desde el reemplazo.
-- Solo agrega una columna (compatible con la versión anterior).
ALTER TABLE aprendizaje_videos ADD COLUMN IF NOT EXISTS renovado_at TIMESTAMPTZ;
