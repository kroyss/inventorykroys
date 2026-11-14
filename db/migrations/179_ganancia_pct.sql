-- 179 · % de ganancia por producto (14-11-2026, el dueño): reemplaza a las "categorías de ganancia" en la pantalla.
-- Un número por producto (0 a 200 %, markup sobre el costo: precio base = costo × (1 + %)). Cada producto copia el %
-- de su categoría actual, así queda donde estaba. profit_category_id NO se borra (la versión anterior la sigue leyendo
-- durante la subida; las lecturas nuevas usan COALESCE(ganancia_pct, % de la categoría)).
-- Colores de la ganancia neta (sana / ajustada / pérdida): app_settings margen_sano / margen_ajustado (sin fila = 20 / 0).
-- Idempotente.
ALTER TABLE product_pricing ADD COLUMN IF NOT EXISTS ganancia_pct NUMERIC(7,2);

UPDATE product_pricing pp SET ganancia_pct = pc.profit_percentage
FROM profit_categories pc
WHERE pc.id = pp.profit_category_id AND pp.ganancia_pct IS NULL;
