// Un solo peso por producto (13-11-2026, el dueño, mig. 174). El peso que manda para el envío gratis es el del portal de
// MercadoEnvíos (me_productos, lo trae la extensión de Pagos ME una vez al día). Pasa al producto por sus vínculos:
// si TODAS sus publicaciones de 1 unidad con peso en el portal pesan igual → ese peso (origen 'ml', no se edita a mano).
// Si pesan distinto (pack sin marcar «trae N u.» o vínculo mal hecho) no se toca y MercadoEnvíos lo muestra para revisar.
// Sin dato del portal: el peso cargado a mano. Así Promociones, precios, margen y Costos ML usan el mismo número.
import type { Pool } from 'pg'
import { estadoTraida, ocupada } from '@/lib/meTraida'

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

/** Los dos en orden (14-11): primero el peso real del portal (pisa al borrador) y después el de la publicación para los
 *  que sigan sin peso. Se llama al crear, importar o vincular productos, al leer el catálogo y con «Traer pesos de ML»,
 *  así un producto nuevo no se queda sin peso hasta la próxima traída de Pagos ME. Nunca rompe a quien la llama. */
export async function pasarPesos(db: Pick<Pool, 'query'>, opc: { pedirME?: number } = {}): Promise<{ portal: number; publicacion: number }> {
  const portal = await sincronizarPesos(db).catch(e => { console.error('[pesos portal]', e instanceof Error ? e.message : e); return 0 })
  const publicacion = await pesosDePublicaciones(db).catch(e => { console.error('[pesos publicacion]', e instanceof Error ? e.message : e); return 0 })
  if (opc.pedirME !== undefined) await pedirPesosSiFaltan(db, opc.pedirME).catch(e => console.error('[pesos pedir ME]', e instanceof Error ? e.message : e))
  return { portal, publicacion }
}

/** Pide al programa de Pagos ME una traída CON pesos del portal (14-11, el dueño: el peso real solo llega así) cuando
 *  hay publicaciones vinculadas que todavía no tienen peso del portal. Solo empresas de Venezuela con Pagos ME, sin
 *  repetir: no si ya hay una traída en curso ni si se pidió una con pesos en los últimos 30 min. Al llegar los pesos,
 *  el vigilante (api/pagos-me/vigilante/productos) los pasa a los productos. Devuelve true si la pidió. */
export async function pedirPesosSiFaltan(db: Pick<Pool, 'query'>, usuarioId: number): Promise<boolean> {
  const { rows: [r] } = await db.query(`
    SELECT e.country = 'VE' AND 'pagos_me' = ANY(e.modulos) AS con_me,
           EXISTS (SELECT 1 FROM product_ml_codes pm JOIN products p ON p.id = pm.product_id
                   WHERE pm.is_active AND p.is_active AND pm.unidades = 1
                     AND NOT EXISTS (SELECT 1 FROM me_productos mp
                                     WHERE mp.publicacion = 'MLV' || split_part(pm.ml_code, ':', 1) AND mp.peso_kg > 0)) AS faltan,
           EXISTS (SELECT 1 FROM me_pedidos WHERE pesos AND pedido_at > NOW() - INTERVAL '30 minutes') AS reciente
    FROM empresas e WHERE e.id = NULLIF(current_setting('app.empresa_id', true), '')::int`)
  if (!r?.con_me || !r.faltan || r.reciente) return false
  if (ocupada(await estadoTraida(db))) return false
  await db.query(`INSERT INTO me_pedidos (pedido_por, pesos) VALUES ($1, TRUE)`, [usuarioId])
  return true
}
