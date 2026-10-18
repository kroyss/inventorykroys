-- 104 · Facturas: corregir una factura emitida CON EL MISMO NÚMERO cuando la hoja preimpresa todavía
-- no se usó (18-10). Cada corrección guarda cómo estaba antes, quién y por qué (no se pierde el rastro).
-- Solo agrega una columna: compatible con la versión anterior (deploy sin corte).
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS correcciones JSONB NOT NULL DEFAULT '[]'::jsonb;
