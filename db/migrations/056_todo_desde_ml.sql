-- 056 · Empresas "todo desde MercadoLibre" (sin inventario).
--
-- * Nuevo módulo `inventario` (Inicio, Ventas, Inventario, Compras, Productos, Reportes, Ajustes).
--   Las empresas que ya existen lo reciben prendido: para ellas no cambia nada. Apagado, la empresa
--   solo ve Automatizaciones y Despachos arma las etiquetas con las ventas que trae de ML.
--   Se agrega una sola vez (si ninguna empresa lo tiene todavía): correrla de nuevo no se lo
--   devuelve a una empresa a la que después se le apagó.
-- * ml_ordenes guarda lo que Despachos necesita de cada venta: detalle (título tal cual en ML,
--   variante y cantidad por producto), estado de la orden (paid, cancelled…) y la copia de las
--   notas de ML (notas_at = cuándo se leyeron; se releen al revisar el lote).
-- Idempotente.
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM empresas WHERE 'inventario' = ANY(modulos)) THEN
    UPDATE empresas SET modulos = array_append(modulos, 'inventario');
  END IF;
END $$;

ALTER TABLE ml_ordenes ADD COLUMN IF NOT EXISTS detalle  JSONB NOT NULL DEFAULT '[]';
ALTER TABLE ml_ordenes ADD COLUMN IF NOT EXISTS estado   TEXT;
ALTER TABLE ml_ordenes ADD COLUMN IF NOT EXISTS notas    TEXT;
ALTER TABLE ml_ordenes ADD COLUMN IF NOT EXISTS notas_at TIMESTAMPTZ;

-- Que el próximo cron vuelva a traer las ventas de 90 días (llena detalle y estado).
UPDATE ml_conexiones SET ordenes_sync_at = NULL;

COMMIT;
