-- 090: Nuestra calificación y el resultado de los pedidos de cambio (2026-10-15). lib/reputacionML.ts
--
--   cal_vendedor_msg: el texto que le pusimos al comprador (cal_vendedor / cal_concretada ya estaban):
--     en las contradictorias se muestra junto a la suya, y "Corregir" la cambia en ML (PUT /feedback/{id}).
--   cal_cambio_resultado: cómo terminó el pedido de cambio de calificación: 'cambiada' (la mejoró),
--     'quitada' (ML la sacó), 'sin_cambio' (respondió y la dejó igual o peor). NULL = todavía esperando.
--   cal_cambio_resuelto_at: cuándo nos enteramos. Los pedidos se siguen mirando hasta saberlo, aunque la
--     calificación ya tenga más de 30 días (antes salían de la lista sin resultado).
-- Idempotente.

ALTER TABLE ml_ordenes ADD COLUMN IF NOT EXISTS cal_vendedor_msg       TEXT;
ALTER TABLE ml_ordenes ADD COLUMN IF NOT EXISTS cal_cambio_resultado   TEXT;
ALTER TABLE ml_ordenes ADD COLUMN IF NOT EXISTS cal_cambio_resuelto_at TIMESTAMPTZ;
