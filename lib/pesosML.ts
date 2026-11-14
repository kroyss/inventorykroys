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

// ── Peso de la PUBLICACIÓN (14-11-2026, el dueño) ───────────────────────────────────────────────────────────────────
// Sin el portal (empresas sin Pagos ME), el peso sale del atributo «Peso del paquete del seller» que ya trae el catálogo
// (ml_catalogo.ficha, lib/catalogoML.ts): es lo que el vendedor declaró en ML. Queda como BORRADOR (origen
// 'publicacion'): se usa, pero se marca «de la publicación · revísalo» y se puede cambiar (al editarlo pasa a 'manual').
// Solo llena productos SIN peso, y si TODAS sus publicaciones de 1 unidad declaran el mismo. El del portal lo pisa.

/** SQL: kg declarados en la ficha de la publicación (NULL si no lo tiene). `ficha` = columna de ml_catalogo. */
export const sqlPesoFicha = (ficha: string) =>
  `(NULLIF(replace(substring(${ficha} from 'Peso del paquete del seller: ([0-9]+(?:[.,][0-9]+)?) g'), ',', '.'), '')::numeric / 1000)`

export async function pesosDePublicaciones(db: Pick<Pool, 'query'>): Promise<number> {
  const { rowCount } = await db.query(`
    WITH pesos AS (
      SELECT pm.product_id, MIN(${sqlPesoFicha('c.ficha')}) AS mn, MAX(${sqlPesoFicha('c.ficha')}) AS mx
      FROM product_ml_codes pm
      JOIN ml_catalogo c ON substring(c.item_id FROM 4) = split_part(pm.ml_code, ':', 1)
      WHERE pm.is_active AND pm.unidades = 1 AND ${sqlPesoFicha('c.ficha')} > 0
      GROUP BY pm.product_id)
    UPDATE products p SET weight_kg = round(x.mn, 3), peso_origen = 'publicacion'
    FROM pesos x
    WHERE x.product_id = p.id AND x.mn = x.mx AND x.mn <= 200 AND (p.weight_kg IS NULL OR p.weight_kg <= 0)`)
  return rowCount ?? 0
}
