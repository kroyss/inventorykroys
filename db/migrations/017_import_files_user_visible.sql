-- 017: visibilidad de archivos de importación para el usuario normal
--
-- Las importaciones acumulan muchas fotos (pagos, comprobantes, mercancía…).
-- El usuario normal solo debe ver las que el admin marque al pasar a EN_CAMINO
-- (la mercancía que viene en camino), nunca las de pagos u otras internas.
--
-- Por defecto FALSE: nada es visible hasta que el admin lo elija explícitamente.
-- Idempotente. Aplicar en AMBAS bases (inventory_ve e inventory_co).

ALTER TABLE import_order_files
  ADD COLUMN IF NOT EXISTS visible_to_user BOOLEAN NOT NULL DEFAULT FALSE;
