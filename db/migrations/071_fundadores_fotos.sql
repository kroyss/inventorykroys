-- 071 · Fotos en la nota interna de cada postulante a Fundador (2026-10-06).
-- Para guardar la investigación (capturas del perfil de MercadoLibre, reputación, etc.) y verla en
-- la próxima ronda: la lista muestra lo anotado en rondas anteriores para el mismo Telegram o nick.
-- Global como fundadores_solicitudes (solo la ve el dueño de la plataforma). Los archivos van en
-- UPLOAD_DIR/fundadores/{solicitud}/.
CREATE TABLE IF NOT EXISTS fundadores_fotos (
  id            SERIAL PRIMARY KEY,
  solicitud_id  INTEGER NOT NULL REFERENCES fundadores_solicitudes(id) ON DELETE CASCADE,
  archivo       TEXT NOT NULL,
  tipo          TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fundadores_fotos_solicitud ON fundadores_fotos (solicitud_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON fundadores_fotos TO inventory_app;
GRANT USAGE, SELECT ON SEQUENCE fundadores_fotos_id_seq TO inventory_app;
