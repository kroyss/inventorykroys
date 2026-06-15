import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { z } from 'zod'
import { getSessionDb, unauthorized, forbidden } from '@/lib/session'

const Schema = z.object({
  items: z.array(z.object({
    product_id:   z.number().int().positive(),
    received_qty: z.number().int().nonnegative(),
  })).min(1),
  partial: z.boolean(),
})

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()

  try {
    const { items, partial: requestedPartial } = Schema.parse(await req.json())
    const userId = parseInt(session.user.id, 10)

    const { rows: [order] } = await db.query(
      `SELECT * FROM purchase_orders WHERE id = $1`,
      [id]
    )
    if (!order) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
    if (!['EN_CAMINO','PARCIAL'].includes(order.status)) {
      return NextResponse.json(
        { error: 'Solo se puede recibir desde EN_CAMINO o PARCIAL' },
        { status: 409 }
      )
    }
    // Si ya hay parciales cargadas, toda recepción adicional debe ser parcial
    // (acumulativa). Una "completa" sobrescribiría total_received_qty y dejaría
    // inventario fantasma al reabrir. El modelo "completa→carga al finalizar"
    // solo aplica a la PRIMERA recepción desde EN_CAMINO.
    const partial = order.status === 'PARCIAL' ? true : requestedPartial

    await db.query('BEGIN')
    try {
      for (const recv of items) {
        if (recv.received_qty <= 0) continue

        // partial=true: accumulate total_received_qty across multiple batches
        // partial=false: SET total_received_qty = received_qty (single receipt)
        if (partial) {
          await db.query(
            `UPDATE purchase_order_items
             SET received_qty       = $1,
                 total_received_qty = COALESCE(total_received_qty, 0) + $1
             WHERE purchase_order_id = $2 AND product_id = $3`,
            [recv.received_qty, id, recv.product_id]
          )
        } else {
          await db.query(
            `UPDATE purchase_order_items
             SET received_qty       = $1,
                 total_received_qty = $1
             WHERE purchase_order_id = $2 AND product_id = $3`,
            [recv.received_qty, id, recv.product_id]
          )
        }

        if (partial) {
          // Insert inventory row if missing (legacy parity)
          const { rows: [inv] } = await db.query(
            `SELECT id FROM inventory WHERE product_id = $1`, [recv.product_id]
          )
          if (inv) {
            await db.query(
              `UPDATE inventory SET quantity = quantity + $1, last_updated = NOW() WHERE product_id = $2`,
              [recv.received_qty, recv.product_id]
            )
          } else {
            await db.query(
              `INSERT INTO inventory (product_id, quantity, min_stock, max_stock, sale_price)
               VALUES ($1, $2, 0, 0, 0)`,
              [recv.product_id, recv.received_qty]
            )
          }
          await db.query(
            `INSERT INTO inventory_movements
               (product_id, movement_type, quantity, reference, notes, created_by)
             VALUES ($1, 'IN', $2, $3, $4, $5)`,
            [recv.product_id, recv.received_qty, order.order_number,
             `Recepción parcial ${order.order_number}`, userId]
          )
        }
      }

      const newStatus = partial ? 'PARCIAL' : 'RECIBIDA'
      await db.query(
        `UPDATE purchase_orders
         SET status = $1, received_by = $2, received_at = NOW()
         WHERE id = $3`,
        [newStatus, userId, id]
      )

      await db.query('COMMIT')
      return NextResponse.json({ ok: true, status: newStatus })
    } catch (e) {
      await db.query('ROLLBACK')
      throw e
    }
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.message }, { status: 400 })
    return apiError(err)
  }
}
