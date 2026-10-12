-- 085: Calificaciones contradictorias (2026-10-12). lib/reputacionML.ts
--
-- En /orders/{id}/feedback cada lado dice si la venta se concretó (sale.fulfilled = nosotros,
-- purchase.fulfilled = el comprador). Si no coinciden, ML la considera contradictoria.
--   cal_recibida_concretada: lo que dijo el comprador.
--   cal_contradictoria: true/false cuando los dos calificamos; NULL si nosotros todavía no.
-- Idempotente.

ALTER TABLE ml_ordenes ADD COLUMN IF NOT EXISTS cal_recibida_concretada BOOLEAN;
ALTER TABLE ml_ordenes ADD COLUMN IF NOT EXISTS cal_contradictoria      BOOLEAN;
