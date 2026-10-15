-- 091: Pedir calificación al comprador, A MANO (2026-10-15, pedido de Beto). lib/pedirCalificacion.ts
--
-- Mensajes → "Pedir calificación": ventas que YA calificamos concretada y positiva, donde el comprador
-- todavía no nos calificó, dentro de su plazo (en MLV ~7 días desde la compra) y sin mensajes suyos
-- sin responder. Una persona revisa el texto y lo envía; se pide UNA vez por venta.
--   cal_pedida_at / cal_pedida_por: cuándo y quién se lo pidió (no se vuelve a ofrecer).
--   cal_no_pedir: "No pedir" (comprador problemático, etc.): sale de la lista sin mandar nada.
-- Idempotente.

ALTER TABLE ml_ordenes ADD COLUMN IF NOT EXISTS cal_pedida_at  TIMESTAMPTZ;
ALTER TABLE ml_ordenes ADD COLUMN IF NOT EXISTS cal_pedida_por INTEGER REFERENCES users(id);
ALTER TABLE ml_ordenes ADD COLUMN IF NOT EXISTS cal_no_pedir   BOOLEAN NOT NULL DEFAULT FALSE;
