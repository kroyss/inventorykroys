-- 086: Pedido de cambio de calificación (2026-10-12). lib/reputacionML.ts
--
-- ML no deja pedirlo por API (es su página feedback.mercadolibre.com.ve/changeRequest), pero
-- /orders/{id}/feedback → purchase.change_request = { status, sent_date } dice si ya se pidió,
-- desde donde sea. Pedido = ya no hay nada que hacer: deja de contar como aviso.
-- Idempotente.

ALTER TABLE ml_ordenes ADD COLUMN IF NOT EXISTS cal_cambio_estado TEXT;          -- 'pending', … (NULL = no se pidió)
ALTER TABLE ml_ordenes ADD COLUMN IF NOT EXISTS cal_cambio_at     TIMESTAMPTZ;   -- cuándo se pidió
