-- 128 · Visitas a /registro (27-10, pedido del dueño: medir la publicidad del link). GLOBAL (la página no tiene empresa).
--   Una fila por vez que se abre la página en un navegador (los robots que miran el link, como el de Facebook, no
--   ejecutan la página y no cuentan). visitante = hash de IP + navegador (sin guardar la IP) para contar personas.
--   origen = utm_source del link o el sitio de donde vino. Lo ve solo el dueño en Plataforma → Hoy.
-- Solo agrega: compatible con la versión anterior.
BEGIN;

CREATE TABLE IF NOT EXISTS registro_visitas (
  id         BIGSERIAL PRIMARY KEY,
  creada_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  visitante  TEXT,
  origen     TEXT
);
CREATE INDEX IF NOT EXISTS registro_visitas_creada_idx ON registro_visitas (creada_at);
GRANT SELECT, INSERT ON registro_visitas TO inventory_app;
GRANT USAGE, SELECT ON SEQUENCE registro_visitas_id_seq TO inventory_app;

COMMIT;
