-- 061 · Visitas a la página pública de Fundadores (decidido con el dueño, 2026-10-03).
--
-- Mide el embudo de cada ronda sin herramientas externas: cuántas personas entran a /fundadores,
-- cuántas empiezan el formulario y cuántas lo envían, y de dónde vienen (utm_source del anuncio,
-- el sitio que las mandó o "directo"). La persona = navegador_id (id al azar del navegador, el
-- mismo que ya guarda la postulación): sin IP, sin cookies de terceros. Así cada postulación se
-- une con su origen (fundadores_solicitudes.navegador_id).
--
-- GLOBAL (de la plataforma, como fundadores_solicitudes): sin empresa_id ni RLS. Idempotente.
BEGIN;

CREATE TABLE IF NOT EXISTS fundadores_visitas (
  id            BIGSERIAL PRIMARY KEY,
  fecha         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  navegador_id  TEXT    NOT NULL,
  evento        TEXT    NOT NULL CHECK (evento IN ('vista', 'empezo', 'enviado')),
  origen        TEXT    NOT NULL DEFAULT 'directo',   -- meta / instagram / facebook / whatsapp / google / otro sitio / directo
  campana       TEXT,                                 -- utm_campaign (p. ej. ronda1)
  movil         BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_fundadores_visitas_fecha ON fundadores_visitas (fecha);
CREATE INDEX IF NOT EXISTS idx_fundadores_visitas_nav ON fundadores_visitas (navegador_id, evento, fecha);

GRANT SELECT, INSERT ON fundadores_visitas TO inventory_app;
GRANT USAGE, SELECT ON SEQUENCE fundadores_visitas_id_seq TO inventory_app;

COMMIT;
