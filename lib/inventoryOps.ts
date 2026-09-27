// Operaciones de inventario que tienen que dejar el historial coherente.
//
// Regla: el movimiento registrado es SIEMPRE lo que efectivamente cambió en
// `inventory.quantity`. Si difieren, la suma de movimientos deja de explicar el
// stock y todo lo que se apoya en el historial (el "Total" del panel de
// movimientos, la reconstrucción de días con stock del reporte) muestra números
// que no existen.

type Db = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> }

/**
 * Revierte `qty` unidades de un producto al reabrir una compra/importación.
 *
 * El stock no puede quedar negativo, así que si parte de lo recibido ya se
 * vendió solo se descuenta lo que queda. Antes el inventario se recortaba con
 * GREATEST(0, …) pero el movimiento registraba la resta completa: el historial
 * quedaba desfasado del stock real por la diferencia, para siempre.
 *
 * Devuelve cuánto se descontó realmente.
 */
export async function revertStock(
  db: Db,
  productId: number,
  qty: number,
  reference: string,
  note: string,
  userId: number,
): Promise<number> {
  if (qty <= 0) return 0

  const { rows: [inv] } = await db.query(
    `SELECT quantity FROM inventory WHERE product_id = $1 FOR UPDATE`, [productId]
  )
  const actual  = parseInt(inv?.quantity, 10) || 0
  const applied = Math.min(qty, Math.max(0, actual))
  if (applied <= 0) return 0

  await db.query(
    `UPDATE inventory SET quantity = quantity - $1, last_updated = NOW() WHERE product_id = $2`,
    [applied, productId]
  )
  const detalle = applied < qty
    ? `${note} (se revirtieron ${applied} de ${qty}: el resto ya no estaba en stock)`
    : note
  await db.query(
    `INSERT INTO inventory_movements (product_id, movement_type, quantity, reference, notes, created_by)
     VALUES ($1, 'OUT', $2, $3, $4, $5)`,
    [productId, -applied, reference, detalle, userId]
  )
  return applied
}
