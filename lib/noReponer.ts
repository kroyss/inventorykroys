// Reportes → Stock → Reponer · «No volver a pedir» (17-11, el dueño; mig 184, products.no_reponer_at).
//   - La marca saca el producto de Reponer (y de la cuenta de Inicio) para siempre.
//   - Se DESACTIVA (sale de todo el sistema, como «Desactivar» de Productos) solo cuando: stock 0, nada en camino y sin
//     ventas de ML todavía sin registrar (si no, Por confirmar se quedaría sin producto para esa venta). Si no se puede
//     al marcarlo, lo hace solo después (cron de cada minuto, empresas con inventario) cuando se termina de vender.
//   - Una compra o importación creada DESPUÉS de la marca la anula (volviste a pedirlo): vuelve a Reponer y no se apaga.
//   - Reactivar en Productos o «Devolver» borra la marca.
import type { Pool } from 'pg'
import { productosComprometidos } from '@/lib/stockConML'
import { sinEnteraVieja } from '@/lib/vinculoEntero'

/** La marca vale (alias de products): no hubo una compra/importación nueva después. */
export const noReponerSQL = (p = 'p') => `(${p}.no_reponer_at IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM purchase_order_items poi JOIN purchase_orders po ON po.id = poi.purchase_order_id
                  WHERE poi.product_id = ${p}.id AND po.created_at > ${p}.no_reponer_at)
  AND NOT EXISTS (SELECT 1 FROM import_order_items ioi JOIN import_orders io ON io.id = ioi.import_order_id
                  WHERE ioi.product_id = ${p}.id AND io.created_at > ${p}.no_reponer_at))`

// Unidades que faltan llegar (mismos estados que Reportes → Stock → «en camino»).
const EN_CAMINO = `(EXISTS (SELECT 1 FROM purchase_order_items poi JOIN purchase_orders po ON po.id = poi.purchase_order_id
     WHERE poi.product_id = p.id AND po.status IN ('PENDIENTE','PAGADA','EN_CAMINO','PARCIAL','RECIBIDA')
       AND poi.quantity > GREATEST(COALESCE(poi.total_received_qty, 0), COALESCE(poi.received_qty, 0)))
  OR EXISTS (SELECT 1 FROM import_order_items ioi JOIN import_orders io ON io.id = ioi.import_order_id
     WHERE ioi.product_id = p.id AND io.status IN ('PENDIENTE','PAGO_PARCIAL','ESPERANDO_FOTOS','PAGADA','EN_TRANSITO','ADUANA',
       'EN_IMPORTADOR_PAGAR','EN_CAMINO','PARCIAL','RECIBIDA')
       AND ioi.quantity > GREATEST(COALESCE(ioi.total_received_qty, 0), COALESCE(ioi.received_qty, 0))))`

/** Desactiva los marcados que ya se pueden (todos o solo esos ids). Devuelve los ids desactivados. */
export async function desactivarNoReponer(db: Pool, ids?: number[]): Promise<number[]> {
  const { rows: [hay] } = await db.query(
    `SELECT EXISTS (SELECT 1 FROM products p WHERE p.is_active AND ${noReponerSQL()} AND ($1::int[] IS NULL OR p.id = ANY($1))) AS x`,
    [ids ?? null])
  if (!hay?.x) return []   // lo normal en cada pasada del cron: nada marcado, no se calcula lo comprometido
  const comprometidos = [...await productosComprometidos(db)]
  const { rows } = await db.query<{ id: number }>(
    `UPDATE products p SET is_active = FALSE
     WHERE p.is_active AND ${noReponerSQL()} AND ($1::int[] IS NULL OR p.id = ANY($1))
       AND COALESCE((SELECT i.quantity FROM inventory i WHERE i.product_id = p.id), 0) <= 0
       AND NOT ${EN_CAMINO}
       AND NOT (p.id = ANY($2::int[]))
     RETURNING p.id`, [ids ?? null, comprometidos])
  return rows.map(r => r.id)
}

/** Marca (y desactiva los que se puede). Solo productos activos. */
export async function marcarNoReponer(db: Pool, ids: number[], userId: number) {
  const { rowCount } = await db.query(
    `UPDATE products SET no_reponer_at = NOW(), no_reponer_por = $2 WHERE id = ANY($1::int[]) AND is_active`, [ids, userId])
  const desactivados = await desactivarNoReponer(db, ids)
  return { marcados: rowCount ?? 0, desactivados: desactivados.length }
}

/** «Devolver»: borra la marca y, si se había desactivado por esto, lo reactiva. */
export async function devolverNoReponer(db: Pool, ids: number[]) {
  const { rowCount } = await db.query(
    `UPDATE products SET no_reponer_at = NULL, no_reponer_por = NULL, is_active = TRUE
     WHERE id = ANY($1::int[]) AND no_reponer_at IS NOT NULL`, [ids])
  return rowCount ?? 0
}

/** La lista «No vuelves a pedir» (con la marca vigente), para ver quién y cuándo y devolver. */
export async function listaNoReponer(db: Pool) {
  const { rows } = await db.query(
    `SELECT p.id, p.code, p.name, p.is_active AS activo, COALESCE(i.quantity, 0)::int AS stock, p.no_reponer_at AS at, u.full_name AS por
     FROM products p LEFT JOIN inventory i ON i.product_id = p.id LEFT JOIN users u ON u.id = p.no_reponer_por
     WHERE ${noReponerSQL()} ORDER BY p.no_reponer_at DESC LIMIT 500`)
  return rows
}

/** Para la confirmación: las publicaciones ACTIVAS en ML de esos productos (para ver una mala vinculación) y cuáles
 *  tienen ventas de ML sin registrar (esos no se desactivan todavía). */
export async function antesDeMarcar(db: Pool, ids: number[]) {
  const [{ rows }, comprometidos] = await Promise.all([
    db.query(
      `SELECT DISTINCT ON (m.product_id, c.item_id) m.product_id, m.ml_account AS cuenta, c.item_id, c.titulo, c.disponible::int AS disponible
       FROM product_ml_codes m JOIN ml_catalogo c ON substring(c.item_id FROM 4) = split_part(m.ml_code, ':', 1)
       WHERE m.is_active AND m.product_id = ANY($1::int[]) AND c.estado = 'active' AND ${sinEnteraVieja('m')}
       ORDER BY m.product_id, c.item_id`, [ids]),
    productosComprometidos(db),
  ])
  return { pubs: rows, comprometidos: ids.filter(id => comprometidos.has(id)) }
}
