-- 198 · Kits (24-11, pedido del dueño: «Kit 4 Tintas Epson 544» = 1 negra + 1 cian + 1 magenta + 1 amarilla).
-- Una publicación de ML vinculada a VARIOS productos distintos era siempre «compartida» (el comprador elige uno: ML recibe
-- la SUMA). Marcada como kit, cada venta trae TODOS sus productos (cada uno × su «trae N u.»), ML recibe lo que se puede
-- armar (el MÍNIMO entre sus productos) y al registrar la venta se descuenta cada uno.
--   product_ml_codes.kit  TRUE en todos los vínculos de esa publicación (o variante); FALSE = como siempre
-- Compatible con la versión anterior (solo agrega; todo queda en FALSE). Idempotente.
ALTER TABLE product_ml_codes ADD COLUMN IF NOT EXISTS kit BOOLEAN NOT NULL DEFAULT FALSE;
