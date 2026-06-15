import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { z } from 'zod'
import { getSessionDb, unauthorized } from '@/lib/session'

const Schema = z.object({
  status:          z.enum(['FINALIZADA', 'INCONSISTENTE']).default('FINALIZADA'),
  incomplete_note: z.string().optional(),
  notes:           z.string().optional(),
})

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  // Finalizar (cargar inventario) lo puede hacer el receptor, admin o normal.

  try {
    const body   = Schema.parse(await req.json())
    const userId = parseInt(session.user.id, 10)

    const { rows: [order] } = await db.query(
      `SELECT id, status FROM import_orders WHERE id = $1`, [id]
    )
    if (!order) return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 })
    if (!['RECIBIDA', 'PARCIAL'].includes(order.status)) {
      return NextResponse.json(
        { error: 'Solo se puede finalizar desde RECIBIDA o PARCIAL' },
        { status: 409 }
      )
    }

    if (body.status === 'INCONSISTENTE' && !body.incomplete_note?.trim()) {
      return NextResponse.json(
        { error: 'La nota es obligatoria para marcar como inconsistente' },
        { status: 400 }
      )
    }

    await db.query('BEGIN')
    try {
      // Load inventory only when coming from RECIBIDA (PARCIAL already loaded per batch)
      if (order.status === 'RECIBIDA') {
        const { rows: items } = await db.query(`
          SELECT product_id,
            CASE WHEN COALESCE(total_received_qty, 0) > 0 THEN total_received_qty
                 WHEN COALESCE(received_qty, 0) > 0      THEN received_qty
                 ELSE quantity END AS effective_qty
          FROM import_order_items WHERE import_order_id=$1
        `, [id])

        for (const item of items) {
          const qty = parseInt(item.effective_qty, 10) || 0
          if (qty <= 0) continue

          // Persist effective qty for future reversals
          await db.query(
            `UPDATE import_order_items SET total_received_qty=$1 WHERE import_order_id=$2 AND product_id=$3`,
            [qty, id, item.product_id]
          )
          // Insert inventory row if missing (legacy parity)
          const { rows: [inv] } = await db.query(
            `SELECT id FROM inventory WHERE product_id = $1`, [item.product_id]
          )
          if (inv) {
            await db.query(
              `UPDATE inventory SET quantity = quantity + $1, last_updated=NOW() WHERE product_id=$2`,
              [qty, item.product_id]
            )
          } else {
            await db.query(
              `INSERT INTO inventory (product_id, quantity, min_stock, max_stock, sale_price)
               VALUES ($1, $2, 0, 0, 0)`,
              [item.product_id, qty]
            )
          }
          await db.query(
            `INSERT INTO inventory_movements (product_id, movement_type, quantity, reference, notes, created_by)
             VALUES ($1, 'IN', $2, $3, $4, $5)`,
            [item.product_id, qty, `Importación #${id}`, 'Finalización importación', userId]
          )
        }
      }

      const noteValue = body.incomplete_note?.trim() || body.notes || null
      if (noteValue !== null) {
        await db.query(
          `UPDATE import_orders SET status=$1, received_by=$2, received_at=NOW(), updated_at=NOW(), notes=$3 WHERE id=$4`,
          [body.status, userId, noteValue, id]
        )
      } else {
        await db.query(
          `UPDATE import_orders SET status=$1, received_by=$2, received_at=NOW(), updated_at=NOW() WHERE id=$3`,
          [body.status, userId, id]
        )
      }

      await db.query('COMMIT')
      return NextResponse.json({ ok: true, message: `Importación ${body.status.toLowerCase()}. Inventario actualizado.` })
    } catch (e) {
      await db.query('ROLLBACK')
      throw e
    }
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.message }, { status: 400 })
    return apiError(err)
  }
}
