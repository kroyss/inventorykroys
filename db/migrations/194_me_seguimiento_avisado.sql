-- 194 · Cuadre de Pagos ME sin falsas alarmas (21-11-2026, el dueño: «¿por qué Telegram me lo avisa como si fuera una
-- preocupación real?»). La venta suelta pasa a seguimiento SIN avisar; el aviso sale recién cuando una traída la pidió
-- por su número y no volvió. `avisado_at` = ya se avisó (una sola vez por venta). Solo agrega: compatible con la versión
-- anterior. Idempotente.
ALTER TABLE me_seguimiento ADD COLUMN IF NOT EXISTS avisado_at TIMESTAMPTZ;
