import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { z } from 'zod'
import { getSessionDb, unauthorized, forbidden } from '@/lib/session'
import { resolveSupplierId } from '@/lib/suppliers'

const EditSchema = z.object({
  supplier_id:    z.number().int().positive().nullable().optional(),
  supplier_name:  z.string().optional(),
  origin_country: z.string().optional(),
  notes:          z.string().optional(),
  items: z.array(z.object({
    product_id:    z.number().int().positive(),
    quantity:      z.number().int().positive(),
    unit_cost_usd: z.number().nonnegative(),
    notes:         z.string().optional(),
  })).min(1),
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
      `SELECT id FROM import_orders WHERE id = $1`, [id]
    )
    if (!order) return NextResponse.json({ error: 'Importación no encontrada' }, { status: 404 })

    const totalUsd = body.items.reduce((s, i) => s + i.quantity * i.unit_cost_usd, 0)

    await db.query('BEGIN')
    try {
      // Campo libre: resolver/crear proveedor por nombre si no vino un id.
      let supplierId = body.supplier_id ?? null
      if (!supplierId && body.supplier_name?.trim()) {
        supplierId = await resolveSupplierId(db, { supplierName: body.supplier_name, type: 'import' })
      }
      await db.query(
        `UPDATE import_orders
         SET supplier_id=$1, total_usd=$2, origin_country=$3, notes=$4, updated_at=NOW()
         WHERE id=$5`,
        [supplierId, totalUsd, body.origin_country ?? null, body.notes ?? null, id]
      )
      await db.query(`DELETE FROM import_order_items WHERE import_order_id = $1`, [id])
      for (const item of body.items) {
        await db.query(
          `INSERT INTO import_order_items
             (import_order_id, product_id, quantity, unit_cost_usd, total_cost_usd, notes)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [id, item.product_id, item.quantity, item.unit_cost_usd,
           item.quantity * item.unit_cost_usd, item.notes ?? null]
        )
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
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  if (session.user.role !== 'admin') return forbidden()

  const { rows: [order] } = await db.query(`SELECT id FROM import_orders WHERE id = $1`, [id])
  if (!order) return NextResponse.json({ error: 'Importación no encontrada' }, { status: 404 })

  await db.query(`DELETE FROM import_order_items WHERE import_order_id = $1`, [id])
  await db.query(`DELETE FROM import_order_files WHERE import_order_id = $1`, [id])
  await db.query(`DELETE FROM import_orders WHERE id = $1`, [id])
  return NextResponse.json({ ok: true })
}
