-- Backfill histórico de comisión ML — VENEZUELA (inventory_ve)
-- Rellena unit_commission en ventas ML viejas que quedaron en 0 (procesadas
-- antes de la migración 016, que no backfilleó). Así el histórico de márgenes
-- compara parejo con los meses nuevos, en vez de verse "inflado" hacia atrás.
--
-- Usa los parámetros ML ACTUALES de Ajustes (app_settings) y la MISMA fórmula
-- que congela el sistema al procesar una venta VE (ver app/api/sales/[id]/status):
--   unit_commission = unit_price * comision%/100 + envio * min(1, unit_price/umbral)
-- Es una aproximación si los parámetros cambiaron desde junio, pero mucho mejor
-- que 0. Excluye ventas LOCAL (venta neta, sin comisión — ver fix-local-sales-commission.sql).
--
-- SEGURO: solo toca filas con unit_commission = 0; idempotente (re-correr no
-- vuelve a tocarlas). Hacé backup antes igual (ver instrucciones del deploy).
--   docker exec -i inventory_db_ve psql -U postgres -d inventory_ve < backfill-ml-commission-ve.sql

WITH cfg AS (
  SELECT
    COALESCE(MAX(value) FILTER (WHERE key = 'ml_comision'), '12')::numeric   AS comision,
    COALESCE(MAX(value) FILTER (WHERE key = 'ml_envio'),    '0.65')::numeric AS envio,
    COALESCE(MAX(value) FILTER (WHERE key = 'ml_umbral'),   '5')::numeric    AS umbral
  FROM app_settings
)
UPDATE sale_items si
SET unit_commission = ROUND(
      si.unit_price * cfg.comision / 100
      + cfg.envio * LEAST(1, si.unit_price / NULLIF(cfg.umbral, 0))
    , 2)
FROM sales sa, cfg
WHERE sa.id = si.sale_id
  AND sa.status IN ('PROCESADA', 'DESCARGADA')
  AND sa.ml_order_number NOT LIKE 'LOCAL-%'
  AND si.unit_commission = 0;
