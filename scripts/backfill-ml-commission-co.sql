-- Backfill histórico de comisión ML — COLOMBIA (inventory_co)
-- Rellena unit_commission en ventas ML viejas que quedaron en 0 (procesadas
-- antes de la migración 016, que no backfilleó). Así el histórico de márgenes
-- compara parejo con los meses nuevos, en vez de verse "inflado" hacia atrás.
--
-- Usa los parámetros ML ACTUALES de Ajustes (app_settings) y la MISMA fórmula
-- que congela el sistema al procesar una venta CO (ver app/api/sales/[id]/status):
--   unit_commission = unit_price * (comision% + reten%)/100
--                     + (unit_price >= umbral_envio ? envio_alto : envio_bajo)
-- Es una aproximación si los parámetros cambiaron desde junio, pero mucho mejor
-- que 0. Excluye ventas LOCAL (venta neta, sin comisión — ver fix-local-sales-commission.sql).
--
-- SEGURO: solo toca filas con unit_commission = 0; idempotente (re-correr no
-- vuelve a tocarlas). Hacé backup antes igual (ver instrucciones del deploy).
--   docker exec -i inventory_db_co psql -U postgres -d inventory_co < backfill-ml-commission-co.sql

WITH cfg AS (
  SELECT
    COALESCE(MAX(value) FILTER (WHERE key = 'ml_comision'),     '15.5')::numeric  AS comision,
    COALESCE(MAX(value) FILTER (WHERE key = 'ml_reten'),        '1.91')::numeric  AS reten,
    COALESCE(MAX(value) FILTER (WHERE key = 'ml_umbral_envio'), '60000')::numeric AS umbral_envio,
    COALESCE(MAX(value) FILTER (WHERE key = 'ml_envio_alto'),   '8000')::numeric  AS envio_alto,
    COALESCE(MAX(value) FILTER (WHERE key = 'ml_envio_bajo'),   '2600')::numeric  AS envio_bajo
  FROM app_settings
)
UPDATE sale_items si
SET unit_commission = ROUND(
      si.unit_price * (cfg.comision + cfg.reten) / 100
      + CASE WHEN si.unit_price >= cfg.umbral_envio THEN cfg.envio_alto ELSE cfg.envio_bajo END
    , 2)
FROM sales sa, cfg
WHERE sa.id = si.sale_id
  AND sa.status IN ('PROCESADA', 'DESCARGADA', 'DESCARGADA_LOCAL')
  AND sa.ml_order_number NOT LIKE 'LOCAL-%'
  AND si.unit_commission = 0;
