-- 112: Programa Despegue (21-10-2026). Página pública /despegue: 8 semanas de acompañamiento pagado para quien
-- empieza en MercadoLibre (reunión semanal + Domingo de Radar + Telegram). Sin formulario: el cupo se aparta
-- escribiendo por Telegram y pagando (los cobros los lleva el dueño por chat, no el sistema).
--   despegue_grupos  → cupos del grupo que se anuncia (el contador "Quedan X de 8"): `tomados` lo sube el dueño
--                      en Plataforma cada vez que alguien paga. Global (no es de ninguna empresa).
--   despegue_visitas → embudo de la página, como fundadores_visitas (061): vista / vio el video / tocó Telegram.
-- Idempotente; solo agrega.

CREATE TABLE IF NOT EXISTS despegue_grupos (
  id            SERIAL PRIMARY KEY,
  nombre        TEXT    NOT NULL,
  cupos         INTEGER NOT NULL DEFAULT 8 CHECK (cupos > 0),
  tomados       INTEGER NOT NULL DEFAULT 0 CHECK (tomados >= 0),
  inicio        DATE    NOT NULL,             -- primer domingo (Radar + bienvenida)
  aparta_hasta  DATE    NOT NULL,             -- último día para apartar el cupo (pago)
  actual        BOOLEAN NOT NULL DEFAULT TRUE,  -- el que muestra la página
  creado_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO despegue_grupos (nombre, cupos, inicio, aparta_hasta)
SELECT 'Grupo 1 · noviembre 2026', 8, DATE '2026-11-08', DATE '2026-11-06'
WHERE NOT EXISTS (SELECT 1 FROM despegue_grupos);

CREATE TABLE IF NOT EXISTS despegue_visitas (
  id            BIGSERIAL PRIMARY KEY,
  fecha         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  navegador_id  TEXT    NOT NULL,
  evento        TEXT    NOT NULL CHECK (evento IN ('vista', 'video', 'telegram')),
  origen        TEXT    NOT NULL DEFAULT 'directo',
  campana       TEXT,
  movil         BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_despegue_visitas_fecha ON despegue_visitas (fecha);
CREATE INDEX IF NOT EXISTS idx_despegue_visitas_nav ON despegue_visitas (navegador_id, evento, fecha);

GRANT SELECT, UPDATE ON despegue_grupos TO inventory_app;
GRANT SELECT, INSERT ON despegue_visitas TO inventory_app;
GRANT USAGE, SELECT ON SEQUENCE despegue_visitas_id_seq TO inventory_app;
