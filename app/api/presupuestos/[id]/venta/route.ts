import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { requestConnection } from '@/lib/requestConnection'
import { sesionPresupuestos, type ItemPresupuesto } from '@/lib/presupuestos'

// POST → el cliente aceptó: se crea una venta LOCAL en BORRADOR con los productos del presupuesto (los ítems libres,
// sin producto, van en la nota de la venta). Desde ahí sigue el flujo normal de Ventas (verificar pago, inventario).
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const s = await sesionPresupuestos()
  if ('error' in s) return s.error
  const id = Number((await params).id)
  const db = await requestConnection(s.db)
  try {
    await db.query('BEGIN')
    const { rows: [p] } = await db.query(`SELECT * FROM presupuestos WHERE id = $1 FOR UPDATE`, [id])
    if (!p) { await db.query('ROLLBACK'); return NextResponse.json({ error: 'No existe' }, { status: 404 }) }
    if (p.sale_id) { await db.query('ROLLBACK'); return NextResponse.json({ error: 'Ya se pasó a venta' }, { status: 409 }) }
    const items = p.items as ItemPresupuesto[]
    const conProducto = items.filter(i => i.product_id && Number.isInteger(i.cantidad))
    if (!conProducto.length) {
      await db.query('ROLLBACK')
      return NextResponse.json({ error: 'No tiene productos del inventario (con cantidades enteras): crea la venta a mano' }, { status: 400 })
    }
    const libres = items.filter(i => !conProducto.includes(i))
    await db.query(`LOCK TABLE sales IN SHARE ROW EXCLUSIVE MODE`)
    const { rows: [u] } = await db.query(
      `SELECT ml_order_number FROM sales WHERE ml_order_number LIKE 'LOCAL-%' ORDER BY ml_order_number DESC LIMIT 1`)
    const ultimo = u ? parseInt(String(u.ml_order_number).replace('LOCAL-', ''), 10) : 0
    const numero = 'LOCAL-' + String((Number.isFinite(ultimo) ? ultimo : 0) + 1).padStart(6, '0')
    const descuento = Number(p.descuento) || 0
    const bruto = conProducto.reduce((a, i) => a + i.cantidad * i.precio, 0)
    const sinProducto = libres.length ? 'Sin producto del inventario: ' + libres.map(i => `${i.cantidad} x ${i.descripcion} a ${i.precio}`).join('; ') : ''
    const nota = [`Presupuesto N° ${p.numero}`, sinProducto, p.notas ?? ''].filter(Boolean).join(' · ').slice(0, 2000)
    const { rows: [venta] } = await db.query(
      `INSERT INTO sales (ml_order_number, status, customer_name, total_amount, discount_percent, notes, created_by)
       VALUES ($1, 'BORRADOR', $2, $3, $4, $5, $6) RETURNING id`,
      [numero, String(p.cliente).slice(0, 100), bruto * (1 - descuento / 100), descuento, nota, Number(s.session.user.id) || null])
    for (const i of conProducto) {
      await db.query(
        `INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, total_price) VALUES ($1, $2, $3, $4, $5)`,
        [venta.id, i.product_id, i.cantidad, i.precio, i.cantidad * i.precio])
    }
    await db.query(`UPDATE presupuestos SET estado = 'aceptado', sale_id = $2, actualizado_at = NOW() WHERE id = $1`, [id, venta.id])
    await db.query('COMMIT')
    return NextResponse.json({ venta: numero, saleId: venta.id, libres: libres.length })
  } catch (err) {
    await db.query('ROLLBACK').catch(() => {})
    return apiError(err)
  }
}
