-- 021 · Peso del producto (kg) para el cálculo de MercadoEnvíos (envío gratis por peso).
--
-- La función de MercadoEnvíos es SOLO VE, pero la columna se agrega a AMBAS DBs porque
-- la query de productos (/api/products) es compartida VE/CO: si CO no tuviera la columna,
-- ese SELECT se rompería. En CO la columna queda dormida (no se usa en UI ni lógica).
--
-- weight_kg: NULL = peso sin registrar. Idempotente. Correr en ambas DBs.

ALTER TABLE products ADD COLUMN IF NOT EXISTS weight_kg NUMERIC(10,3);
