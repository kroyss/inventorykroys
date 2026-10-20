import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized } from '@/lib/session'
import { requestConnection } from '@/lib/requestConnection'
import { localCostFactor } from '@/lib/localCost'
import { parseShippingTable, shippingCostVE } from '@/lib/mlShipping'

// Corregir pedido (20-10, migración 108): un cambio de última hora sobre una venta que YA descontó inventario
// (el cliente cambió de color, se agregó algo, error al procesar). Se corrige la MISMA venta, sin reabrirla:
//   - el inventario se mueve solo por la diferencia (sale lo que se agrega, vuelve lo que se quita), con la
//     referencia de la venta y el motivo; nunca deja el stock negativo (si no alcanza, no se guarda nada);
//   - los productos que siguen conservan su costo y comisión congelados; los nuevos los congelan ahora;
//   - el total se recalcula (con el descuento de la venta);
//   - queda la nota en venta_ajustes: antes / después, quién, cuándo, por qué, si el paquete ya había salido
//     y si hay una factura emitida que quedó desactualizada (se avisa: se corrige en Facturas).
// Todo en una transacción: o queda completo o no queda nada.
//   GET  → los ajustes de la venta (la nota)
//   POST { items: [{ product_id, quantity, unit_price }], motivo }

const ESTADOS_CON_INVENTARIO = ['PROCESADA', 'DESCARGADA', 'DESCARGADA_LOCAL']

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  try {
    const { rows } = await db.query(
      `SELECT a.id, a.fecha, a.motivo, a.antes, a.despues, a.total_antes::float AS total_antes, a.total_despues::float AS total_despues,
              a.despues_de_enviado, a.factura, COALESCE(u.full_name, u.username) AS por
       FROM venta_ajustes a LEFT JOIN users u ON u.id = a.por
       WHERE a.sale_id = $1 ORDER BY a.fecha`, [id])
    return NextResponse.json({ ajustes: rows })
  } catch (err) {
    return apiError(err)
  }
}

const Body = z.object({
  items: z.array(z.object({
    product_id: z.number().int().positive(),
    quantity:   z.number().int().positive('La cantidad debe ser 1 o más'),
    unit_price: z.number().min(0),
  })).min(1, 'La venta debe quedar con al menos un producto').max(50),
  motivo: z.string().trim().min(3, 'Escribe qué pasó (corto)').max(300),
})

type Linea = { product_id: number; nombre: string; cantidad: number; precio: number }

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  const { session, db: pool } = await getSessionDb()
  if (!session || !pool) return unauthorized()
  const userId = parseInt(session.user.id, 10)
  const db = await requestConnection(pool)
  try {
    const b = Body.parse(await req.json())
    // Un producto una sola vez (si viene repetido, se suma).
    const nuevos = new Map<number, { quantity: number; unit_price: number }>()
    for (const i of b.items) {
      const x = nuevos.get(i.product_id)
      nuevos.set(i.product_id, { quantity: (x?.quantity ?? 0) + i.quantity, unit_price: x?.unit_price ?? i.unit_price })
    }
    const costFactor = await localCostFactor(session.user.country)

    await db.query('BEGIN')
    const { rows: [sale] } = await db.query(
      `SELECT id, status, ml_order_number, discount_percent::float AS discount_percent, total_amount::float AS total_amount
       FROM sales WHERE id = $1 FOR UPDATE`, [id])
    if (!sale) { await db.query('ROLLBACK'); return NextResponse.json({ error: 'Venta no encontrada' }, { status: 404 }) }
    if (!ESTADOS_CON_INVENTARIO.includes(sale.status)) {
      await db.query('ROLLBACK')
      return NextResponse.json({ error: 'Esta venta todavía no descontó inventario: corrígela con "Editar" en Ventas.' }, { status: 409 })
    }

    const { rows: viejos } = await db.query(
      `SELECT si.product_id, p.name AS nombre, si.quantity, si.unit_price::float AS unit_price,
              si.unit_cost::float AS unit_cost, si.unit_commission::float AS unit_commission, si.notes
       FROM sale_items si JOIN products p ON p.id = si.product_id WHERE si.sale_id = $1 ORDER BY si.id`, [id])
    const viejoPor = new Map<number, { quantity: number; unit_price: number; unit_cost: number | null; unit_commission: number | null; notes: string | null; nombre: string }>()
    for (const v of viejos) {
      const x = viejoPor.get(v.product_id)
      viejoPor.set(v.product_id, { ...v, quantity: (x?.quantity ?? 0) + v.quantity })
    }

    // Productos nuevos: que existan, con su nombre, peso y costo.
    const ids = [...new Set([...nuevos.keys(), ...viejoPor.keys()])]
    const { rows: prods } = await db.query(
      `SELECT p.id, p.name, p.weight_kg::float AS weight_kg, COALESCE(pp.total_cost, 0)::float AS costo
       FROM products p LEFT JOIN product_pricing pp ON pp.product_id = p.id WHERE p.id = ANY($1)`, [ids])
    const prod = new Map(prods.map(p => [p.id as number, p]))
    for (const pid of nuevos.keys()) {
      if (!prod.has(pid)) { await db.query('ROLLBACK'); return NextResponse.json({ error: `Producto ${pid} no existe` }, { status: 400 }) }
    }

    // ¿Cambió algo?
    const igual = nuevos.size === viejoPor.size && [...nuevos].every(([pid, n]) => {
      const v = viejoPor.get(pid); return !!v && v.quantity === n.quantity && Math.abs(v.unit_price - n.unit_price) < 0.005
    })
    if (igual) { await db.query('ROLLBACK'); return NextResponse.json({ error: 'No cambiaste nada en el pedido' }, { status: 400 }) }

    // Inventario por la diferencia. Primero se valida TODO (que alcance el stock) y después se mueve.
    const referencia = `Venta #${id} (corrección)`
    const deltas = ids.map(pid => ({ pid, d: (nuevos.get(pid)?.quantity ?? 0) - (viejoPor.get(pid)?.quantity ?? 0) })).filter(x => x.d !== 0)
    for (const { pid, d } of deltas.filter(x => x.d > 0)) {
      const { rows: [inv] } = await db.query(`SELECT quantity FROM inventory WHERE product_id = $1 FOR UPDATE`, [pid])
      if (!inv) { await db.query('ROLLBACK'); return NextResponse.json({ error: `${prod.get(pid)?.name ?? pid}: no tiene inventario` }, { status: 400 }) }
      if (inv.quantity < d) {
        await db.query('ROLLBACK')
        return NextResponse.json({ error: `Stock insuficiente para '${prod.get(pid)?.name}'. Disponible: ${inv.quantity}, requerido: ${d}` }, { status: 400 })
      }
    }
    for (const { pid, d } of deltas) {
      // d > 0: sale más (OUT, negativo) · d < 0: vuelve al stock (IN, positivo). El movimiento = lo que cambió.
      const { rowCount } = await db.query(`UPDATE inventory SET quantity = quantity - $1, last_updated = NOW() WHERE product_id = $2`, [d, pid])
      if (!rowCount) {   // sin fila de inventario no se registra un movimiento que no cambió nada
        await db.query('ROLLBACK')
        return NextResponse.json({ error: `${prod.get(pid)?.name ?? pid}: no tiene inventario` }, { status: 400 })
      }
      await db.query(
        `INSERT INTO inventory_movements (product_id, movement_type, quantity, reference, notes, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [pid, d > 0 ? 'OUT' : 'IN', -d, referencia, b.motivo.slice(0, 200), userId])
    }

    // Comisión de ML congelada para un producto que no estaba (las LOCAL no tienen comisión).
    const esLocal = (sale.ml_order_number as string).startsWith('LOCAL-')
    let comision: (precio: number, peso: number | null) => number = () => 0
    if (!esLocal) {
      const mlp: Record<string, number> = {}
      let tabla: string | null = null
      const { rows: aj } = await db.query(`SELECT key, value FROM app_settings`)
      for (const r of aj) { if (r.key === 'ml_shipping_table') tabla = r.value; const v = parseFloat(r.value); if (!isNaN(v)) mlp[r.key] = v }
      comision = session.user.country === 'CO'
        ? precio => Math.round((precio * ((mlp.ml_comision ?? 15.5) + (mlp.ml_reten ?? 1.91)) / 100
            + (precio >= (mlp.ml_umbral_envio ?? 60000) ? (mlp.ml_envio_alto ?? 8000) : (mlp.ml_envio_bajo ?? 2600))) * 100) / 100
        : (precio, peso) => Math.round((precio * (mlp.ml_comision ?? 12) / 100
            + shippingCostVE(precio, peso, parseShippingTable(tabla), mlp.ml_envio ?? 0.65, mlp.ml_umbral ?? 5)) * 100) / 100
    }

    // La venta queda con los productos nuevos: los que siguen conservan costo, comisión y nota.
    await db.query(`DELETE FROM sale_items WHERE sale_id = $1`, [id])
    let bruto = 0
    for (const [pid, n] of nuevos) {
      const v = viejoPor.get(pid), p = prod.get(pid)!
      const mismoPrecio = !!v && Math.abs(v.unit_price - n.unit_price) < 0.005
      const unitCost = v?.unit_cost != null ? v.unit_cost : Math.round(p.costo * costFactor * 100) / 100
      const unitCom = esLocal ? 0 : mismoPrecio && v?.unit_commission != null ? v.unit_commission : comision(n.unit_price, p.weight_kg)
      bruto += n.quantity * n.unit_price
      await db.query(
        `INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, total_price, notes, unit_cost, unit_commission)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [id, pid, n.quantity, n.unit_price, n.quantity * n.unit_price, v?.notes ?? null, unitCost, unitCom])
    }
    const total = Math.round((sale.discount_percent > 0 ? bruto * (1 - sale.discount_percent / 100) : bruto) * 100) / 100
    await db.query(`UPDATE sales SET total_amount = $2, updated_at = NOW() WHERE id = $1`, [id, total])

    // La nota: ¿ya había salido el paquete? ¿hay una factura emitida que quedó vieja?
    const { rows: [salio] } = await db.query(
      `SELECT EXISTS (SELECT 1 FROM despacho_etiquetas e JOIN despacho_lotes l ON l.id = e.lote_id
                      JOIN despacho_jornadas j ON j.id = l.jornada_id
                      WHERE e.venta = $1 AND e.impresa AND j.status = 'CERRADA' AND e.apartado IS NULL) AS si`, [sale.ml_order_number])
    const { rows: [fac] } = await db.query(
      `SELECT invoice_number FROM invoices WHERE sale_id = $1 AND status = 'EMITIDA' LIMIT 1`, [id])
    const linea = (pid: number, cantidad: number, precio: number): Linea => ({ product_id: pid, nombre: prod.get(pid)?.name ?? viejoPor.get(pid)?.nombre ?? String(pid), cantidad, precio })
    await db.query(
      `INSERT INTO venta_ajustes (sale_id, por, motivo, antes, despues, total_antes, total_despues, despues_de_enviado, factura)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [id, userId, b.motivo,
       JSON.stringify([...viejoPor].map(([pid, v]) => linea(pid, v.quantity, v.unit_price))),
       JSON.stringify([...nuevos].map(([pid, n]) => linea(pid, n.quantity, n.unit_price))),
       sale.total_amount, total, !!salio?.si, fac?.invoice_number != null ? String(fac.invoice_number) : null])
    await db.query('COMMIT')
    return NextResponse.json({ ok: true, total, factura: fac?.invoice_number ?? null, despues_de_enviado: !!salio?.si })
  } catch (err) {
    await db.query('ROLLBACK').catch(() => {})
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message ?? err.message }, { status: 400 })
    return apiError(err)
  }
}
