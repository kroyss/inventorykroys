// Un solo peso por producto (13-11-2026, el dueño, mig. 174). El peso que manda para el envío gratis es el del portal de
// MercadoEnvíos (me_productos, lo trae la extensión de Pagos ME una vez al día). Pasa al producto por sus vínculos:
// si TODAS sus publicaciones de 1 unidad con peso en el portal pesan igual → ese peso (origen 'ml', no se edita a mano).
// Si pesan distinto (pack sin marcar «trae N u.» o vínculo mal hecho) no se toca y MercadoEnvíos lo muestra para revisar.
// Sin dato del portal: el peso cargado a mano. Así Promociones, precios, margen y Costos ML usan el mismo número.
import type { Pool } from 'pg'

export const PESOS_VINCULADOS = `
  SELECT pm.product_id, MIN(mp.peso_kg) AS mn, MAX(mp.peso_kg) AS mx,
         array_agg(DISTINCT mp.peso_kg::float ORDER BY mp.peso_kg::float) AS todos
  FROM product_ml_codes pm
  JOIN me_productos mp ON mp.publicacion = 'MLV' || split_part(pm.ml_code, ':', 1)
  WHERE pm.is_active AND pm.unidades = 1 AND mp.peso_kg > 0
  GROUP BY pm.product_id`

/** Pasa a los productos el peso del portal (después de cada traída de pesos). Devuelve cuántos cambiaron. */
export async function sincronizarPesos(db: Pick<Pool, 'query'>): Promise<number> {
  const { rowCount } = await db.query(`
    WITH pesos AS (${PESOS_VINCULADOS})
    UPDATE products p SET weight_kg = x.mn, peso_origen = 'ml'
    FROM pesos x
    WHERE x.product_id = p.id AND x.mn = x.mx AND (p.weight_kg IS DISTINCT FROM x.mn OR p.peso_origen IS DISTINCT FROM 'ml')`)
  return rowCount ?? 0
}

/** Para un LEFT JOIN (alias pv): los pesos distintos del portal cuando NO coinciden (float[]); NULL si coinciden o no hay. */
export const SQL_PESOS_DISTINTOS = `CASE WHEN pv.mn <> pv.mx THEN pv.todos END`
