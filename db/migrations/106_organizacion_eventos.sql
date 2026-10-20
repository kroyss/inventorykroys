-- 106 · Historia de la cuenta de cada cliente (20-10): qué le pasó y cuándo (pausada por el corte, reactivada por
-- el dueño hasta tal fecha, apagada a mano…), para verlo en Plataforma → Clientes sin adivinar.
-- GLOBAL (como organizaciones): sin empresa_id ni RLS; solo la usa Plataforma (dueño) y el corte de Fundadores.
--   tipo: 'pausada' (detalle = motivo: corte_fundadores / manual / plan) · 'reactivada' (detalle = hasta AAAA-MM-DD)
--         'activa' (pasó a pagar) · 'apagada' / 'encendida' (desactivar la empresa) · 'fecha' (cambio de vencimiento)
-- Solo agrega una tabla: compatible con la versión anterior.
BEGIN;

CREATE TABLE IF NOT EXISTS organizacion_eventos (
  id              SERIAL PRIMARY KEY,
  organizacion_id INTEGER NOT NULL REFERENCES organizaciones(id) ON DELETE CASCADE,
  fecha           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tipo            TEXT NOT NULL,
  detalle         TEXT,
  por             INTEGER REFERENCES users(id) ON DELETE SET NULL   -- NULL = el sistema (p. ej. el corte)
);
CREATE INDEX IF NOT EXISTS idx_organizacion_eventos ON organizacion_eventos (organizacion_id, fecha);
GRANT SELECT, INSERT, UPDATE, DELETE ON organizacion_eventos TO inventory_app;
GRANT USAGE, SELECT ON SEQUENCE organizacion_eventos_id_seq TO inventory_app;

-- Lo que ya pasó: el corte del 19-10 (23:00 hora de Venezuela) a quienes siguen pausados por él.
INSERT INTO organizacion_eventos (organizacion_id, fecha, tipo, detalle)
SELECT o.id, (o.pausa_fecha::text || ' 23:00:00-04')::timestamptz, 'pausada', o.motivo_pausa
FROM organizaciones o
WHERE o.motivo_pausa IS NOT NULL AND o.pausa_fecha IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM organizacion_eventos x WHERE x.organizacion_id = o.id AND x.tipo = 'pausada');

COMMIT;
