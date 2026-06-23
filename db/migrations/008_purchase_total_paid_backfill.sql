-- 008 · Backfill de total_paid en compras locales ya pagadas (VE y CO)
-- El módulo no llenaba total_paid al avanzar a PAGADA, así que muchas órdenes
-- quedaron con monto pagado = 0. Se rellena con el total de la orden.
-- Idempotente: una segunda corrida no toca nada (ya no hay total_paid = 0).

UPDATE purchase_orders
SET total_paid = total_usd
WHERE order_type = 'local'
  AND status NOT IN ('PENDIENTE', 'REABIERTA')
  AND COALESCE(total_paid, 0) = 0
  AND COALESCE(total_usd, 0) > 0;
