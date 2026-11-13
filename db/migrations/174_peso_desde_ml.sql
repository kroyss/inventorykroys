-- 174 (13-11-2026, el dueño): UN solo peso por producto. El peso real del portal de MercadoEnvíos (me_productos, el que
-- usa ML para el envío gratis) pasa al producto por sus vínculos; la carga a mano queda solo donde ML no lo da.
-- Solo agrega. Idempotente. Regla (lib/pesosML.ts): todas las publicaciones vinculadas (de 1 unidad) con peso en el
-- portal pesan IGUAL → ese peso, origen 'ml'. Si pesan distinto (pack sin marcar o vínculo mal hecho) no se toca.
ALTER TABLE products ADD COLUMN IF NOT EXISTS peso_origen TEXT;   -- 'ml' (del portal) | 'manual' | NULL (viejo, a mano)

-- Primera pasada con lo que ya hay (como postgres, todas las empresas: los id de producto son únicos).
WITH pesos AS (
  SELECT pm.product_id, MIN(mp.peso_kg) AS mn, MAX(mp.peso_kg) AS mx
  FROM product_ml_codes pm
  JOIN me_productos mp ON mp.empresa_id = pm.empresa_id AND mp.publicacion = 'MLV' || split_part(pm.ml_code, ':', 1)
  WHERE pm.is_active AND pm.unidades = 1 AND mp.peso_kg > 0
  GROUP BY pm.product_id)
UPDATE products p SET weight_kg = x.mn, peso_origen = 'ml'
FROM pesos x
WHERE x.product_id = p.id AND x.mn = x.mx AND (p.weight_kg IS DISTINCT FROM x.mn OR p.peso_origen IS DISTINCT FROM 'ml');
