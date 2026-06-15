import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { z } from 'zod'
import { getSessionDb, unauthorized } from '@/lib/session'

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
      `SELECT id, status, order_number FROM import_orders WHERE id = $1`, [id]
    )
    if (!order) return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 })
    if (!['EN_CAMINO', 'RECIBIDA', 'PARCIAL'].includes(order.status)) {
      return NextResponse.json(
        { error: 'La orden no está en estado válido para recibir' },
        { status: 409 }
      )
    }
    // Si la orden ya tiene parciales cargadas, toda recepción adicional debe ser
    // parcial (acumulativa). Permitir una recepción "completa" aquí sobrescribiría
    // total_received_qty y dejaría inventario fantasma al reabrir. El modelo
    // "completa → carga al finalizar" solo aplica a la PRIMERA recepción.
    const partial = order.status === 'PARCIAL' ? true : requestedPartial

    await db.query('BEGIN')
    try {
      let totalReceived = 0

      for (const recv of items) {
        if (recv.received_qty <= 0) continue

        if (partial) {
          await db.query(
            `UPDATE import_order_items
             SET received_qty=$1, total_received_qty = COALESCE(total_received_qty, 0) + $1
             WHERE import_order_id=$2 AND product_id=$3`,
            [recv.received_qty, id, recv.product_id]
          )
          // Insert inventory row if missing (legacy parity)
          const { rows: [inv] } = await db.query(
            `SELECT id FROM inventory WHERE product_id = $1`, [recv.product_id]
          )
          if (inv) {
            await db.query(
              `UPDATE inventory SET quantity = quantity + $1, last_updated=NOW() WHERE product_id=$2`,
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
            `INSERT INTO inventory_movements (product_id, movement_type, quantity, reference, notes, created_by)
             VALUES ($1, 'IN', $2, $3, $4, $5)`,
            [recv.product_id, recv.received_qty, order.order_number, 'Recepción parcial importación', userId]
          )
        } else {
          await db.query(
            `UPDATE import_order_items
             SET received_qty=$1, total_received_qty=$1
             WHERE import_order_id=$2 AND product_id=$3`,
            [recv.received_qty, id, recv.product_id]
          )
        }
        totalReceived += recv.received_qty
      }

      const newStatus = partial ? 'PARCIAL' : 'RECIBIDA'
      await db.query(
        `UPDATE import_orders SET status=$1, received_by=$2, received_at=NOW(), updated_at=NOW() WHERE id=$3`,
        [newStatus, userId, id]
      )

      await db.query('COMMIT')
      const msg = partial
        ? 'Recepción parcial registrada. Inventario actualizado. Puedes registrar más entregas.'
        : 'Cantidades guardadas. Pasa a FINALIZADA para cargar al inventario.'
      return NextResponse.json({ ok: true, status: newStatus, total_received: totalReceived, message: msg })
    } catch (e) {
      await db.query('ROLLBACK')
      throw e
    }
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.message }, { status: 400 })
    return apiError(err)
  }
}
