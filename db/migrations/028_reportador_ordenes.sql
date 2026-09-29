-- 028 · Reportador: órdenes desde la web.
--
-- El Reportador queda abierto en la bandeja del equipo y cada ~30 s pregunta si hay una
-- orden. Una orden se crea con el botón "Reportar en <equipo>" de Despachos, o sola al
-- cerrar la jornada si el equipo tiene `auto_reportar`.
--
--   reportador_ordenes.estado:
--     PENDIENTE   esperando a que el equipo la tome (vence a las 12 h: no se dispara a destiempo)
--     EN_CURSO    el equipo la tomó y está reportando
--     TERMINADA   terminó (resumen en `resumen`)
--     CANCELADA   se canceló desde la web antes de que la tomara
--     VENCIDA     nadie la tomó en 12 h
--     INTERRUMPIDA el programa se cerró a mitad (lo no enviado sigue pendiente en la cola)
--   origen: WEB (botón en Despachos) · AUTO (al cerrar la jornada) · EQUIPO ("Reportar
--     ahora" en el propio programa: se registra igual, para verlo y poder detenerlo desde la web)
--   detener_at: se pidió detener desde la web; el equipo corta después del mensaje en curso.
--
-- reportador_equipos.actividad: lo que el equipo está haciendo ahora ("SOLUCION-MC 5/40"),
-- NULL en espera. Idempotente; en AMBAS DBs.

ALTER TABLE reportador_equipos ADD COLUMN IF NOT EXISTS auto_reportar BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE reportador_equipos ADD COLUMN IF NOT EXISTS actividad     TEXT;
ALTER TABLE reportador_equipos ADD COLUMN IF NOT EXISTS actividad_at  TIMESTAMP;

CREATE TABLE IF NOT EXISTS reportador_ordenes (
  id           SERIAL PRIMARY KEY,
  equipo_id    INTEGER NOT NULL REFERENCES reportador_equipos(id),
  origen       VARCHAR(10) NOT NULL DEFAULT 'WEB',
  estado       VARCHAR(12) NOT NULL DEFAULT 'PENDIENTE',
  created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  created_by   INTEGER REFERENCES users(id),
  tomada_at    TIMESTAMP,
  terminada_at TIMESTAMP,
  detener_at   TIMESTAMP,
  resumen      JSONB
);
CREATE INDEX IF NOT EXISTS ix_reportador_ordenes_equipo ON reportador_ordenes(equipo_id, id DESC);
