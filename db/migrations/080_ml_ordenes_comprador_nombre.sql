-- 080: nombre real del comprador en las ventas de ML (2026-10-11). `comprador` es su apodo, que en
-- cuentas nuevas es automático ("BY20240624223837") y no dice nada en Despachos. Se guarda al traer
-- la venta (/orders/{id} trae nombre y apellido) y se completa con lo que ya sabe la mensajería.
-- Idempotente.

ALTER TABLE ml_ordenes ADD COLUMN IF NOT EXISTS comprador_nombre TEXT;

UPDATE ml_ordenes o SET comprador_nombre = NULLIF(TRIM(c.comprador_nombre), '')
FROM ml_conversaciones c
WHERE o.comprador_nombre IS NULL AND c.empresa_id = o.empresa_id
  AND c.pack_id = COALESCE(o.pack_id, o.id) AND NULLIF(TRIM(c.comprador_nombre), '') IS NOT NULL;
