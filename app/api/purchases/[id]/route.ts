import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { z } from 'zod'
import { getSessionDb, unauthorized, forbidden } from '@/lib/session'
import { resolveSupplierId } from '@/lib/suppliers'

const EditSchema = z.object({
  supplier_id:   z.number().int().positive().optional(),
  supplier_name: z.string().optional(),
  notes:         z.string().optional(),
  total_paid:    z.number().nonnegative().optional(),
  items: z.array(z.object({
    product_id:    z.number().int().positive(),
    quantity:      z.number().int().positive(),
    unit_cost_usd: z.number().nonnegative(),
    notes:         z.string().optional(),
  })).min(1).optional(),
})

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  if (session.user.role !== 'admin') return forbidden()

  try {
    const body = EditSchema.parse(await req.json())

    const { rows: [order] } = await db.query(
      `SELECT status FROM purchase_orders WHERE id = $1`,
      [id]
    )
    if (!order) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
    if (!['PENDIENTE', 'REABIERTA'].includes(order.status)) {
      return NextResponse.json(
        { error: 'Solo se pueden editar órdenes en estado PENDIENTE o REABIERTA' },
        { status: 409 }
      )
    }

    await db.query('BEGIN')
    try {
      // Campo libre: resolver/crear proveedor por nombre si no vino un id.
      let supplierId = body.supplier_id
      if (supplierId === undefined && body.supplier_name?.trim()) {
        supplierId = await resolveSupplierId(db, { supplierName: body.supplier_name, type: 'local' })
      }

      if (supplierId !== undefined || body.notes !== undefined || body.total_paid !== undefined) {
        const sets: string[] = []
        const vals: unknown[] = []
        let idx = 1
        if (supplierId !== undefined) { sets.push(`supplier_id = $${idx++}`); vals.push(supplierId) }
        if (body.notes      !== undefined)  { sets.push(`notes = $${idx++}`);       vals.push(body.notes) }
        if (body.total_paid !== undefined)  { sets.push(`total_paid = $${idx++}`);  vals.push(body.total_paid) }
        vals.push(id)
        await db.query(`UPDATE purchase_orders SET ${sets.join(', ')} WHERE id = $${idx}`, vals)
      }

      if (body.items) {
        await db.query(`DELETE FROM purchase_order_items WHERE purchase_order_id = $1`, [id])
        const totalUsd = body.items.reduce((s, i) => s + i.quantity * i.unit_cost_usd, 0)
        for (const item of body.items) {
          await db.query(
            `INSERT INTO purchase_order_items
               (purchase_order_id, product_id, quantity, unit_cost_usd, total_cost_usd, notes)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [id, item.product_id, item.quantity, item.unit_cost_usd, item.quantity * item.unit_cost_usd, item.notes ?? null]
          )
        }
        await db.query(`UPDATE purchase_orders SET total_usd = $1 WHERE id = $2`, [totalUsd, id])
      }

      await db.query('COMMIT')
      return NextResponse.json({ ok: true })
    } catch (e) {
      await db.query('ROLLBACK')
      throw e
    }
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.message }, { status: 400 })
    return apiError(err)
  }
}

export async function DELETE(
  _: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  if (session.user.role !== 'admin') return forbidden()

  const { rows: [order] } = await db.query(
    `SELECT status FROM purchase_orders WHERE id = $1`,
    [id]
  )
  if (!order) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  await db.query('BEGIN')
  try {
    await db.query(`DELETE FROM purchase_order_items WHERE purchase_order_id = $1`, [id])
    await db.query(`DELETE FROM purchase_orders WHERE id = $1`, [id])
    await db.query('COMMIT')
    return NextResponse.json({ ok: true })
  } catch (e) {
    await db.query('ROLLBACK')
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
