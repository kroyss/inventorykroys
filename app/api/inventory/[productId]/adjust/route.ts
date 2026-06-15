import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { z } from 'zod'
import { getSessionDb, unauthorized } from '@/lib/session'

const Schema = z.object({
  movement_type: z.enum(['IN', 'OUT', 'ADJUST']),
  quantity:      z.number().int().min(0),
  notes:         z.string().max(500).optional(),
  reference:     z.string().max(100).optional(),
})

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ productId: string }> }
) {
  const { productId } = await params
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()

  try {
    const body   = Schema.parse(await req.json())
    const userId = Number(session.user.id)

    // Current stock needed to validate OUT and to compute the ADJUST delta
    const { rows: [inv] } = await db.query(
      `SELECT quantity FROM inventory WHERE product_id = $1`, [productId]
    )
    if (!inv) return NextResponse.json({ error: 'Producto no tiene registro de inventario' }, { status: 404 })
    const currentQty = parseInt(inv.quantity, 10) || 0

    if (body.movement_type === 'OUT' && currentQty < body.quantity) {
      return NextResponse.json(
        { error: `Stock insuficiente. Actual: ${currentQty}` },
        { status: 400 }
      )
    }

    // inventory_movements.quantity is stored SIGNED (legacy convention):
    //   IN     → +qty
    //   OUT    → -qty
    //   ADJUST → delta (new total - current)
    let movementQty: number
    let newQty: number
    if (body.movement_type === 'IN') {
      movementQty = body.quantity
      newQty      = currentQty + body.quantity
    } else if (body.movement_type === 'OUT') {
      movementQty = -body.quantity
      newQty      = currentQty - body.quantity
    } else { // ADJUST
      newQty      = body.quantity
      movementQty = newQty - currentQty
    }

    await db.query('BEGIN')
    try {
      await db.query(
        `INSERT INTO inventory_movements
           (product_id, movement_type, quantity, reference, notes, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [productId, body.movement_type, movementQty, body.reference ?? null, body.notes ?? null, userId]
      )
      await db.query(
        `UPDATE inventory SET quantity = $1, last_updated = NOW() WHERE product_id = $2`,
        [newQty, productId]
      )
      await db.query('COMMIT')
    } catch (e) {
      await db.query('ROLLBACK')
      throw e
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.message }, { status: 400 })
    return apiError(err)
  }
}
