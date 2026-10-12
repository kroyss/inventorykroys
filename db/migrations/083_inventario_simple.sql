-- 083: Inventario simple (2026-10-12). Opciones nuevas en empresas.modulos (lib/modulos.ts):
--   verificar_pagos · despachos_ventas · compras_etapas · precios_categorias
-- Prendidas = como trabajaba hasta hoy toda empresa con inventario (SolucionesMC VE y CO): se agregan a
-- las que YA tienen 'inventario', así nada cambia para ellas. Las demás (Fundadores) quedan sin ellas:
-- si un día se les prende el inventario, arrancan en el modo simple. Idempotente.

UPDATE empresas e
SET modulos = (SELECT array_agg(DISTINCT m ORDER BY m)
               FROM unnest(e.modulos || ARRAY['verificar_pagos', 'despachos_ventas', 'compras_etapas', 'precios_categorias']) AS m)
WHERE 'inventario' = ANY(e.modulos)
  AND NOT (e.modulos @> ARRAY['verificar_pagos', 'despachos_ventas', 'compras_etapas', 'precios_categorias']);
