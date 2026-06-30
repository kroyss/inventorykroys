import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { z } from 'zod'
import { getSessionDb, unauthorized, forbidden } from '@/lib/session'

const IMPORT_FLOW = [
  'PENDIENTE', 'PAGO_PARCIAL', 'ESPERANDO_FOTOS', 'PAGADA',
  'EN_TRANSITO', 'ADUANA', 'EN_IMPORTADOR_PAGAR',
  'EN_CAMINO', 'RECIBIDA', 'PARCIAL', 'FINALIZADA', 'INCONSISTENTE',
]

const Schema = z.object({
  status:          z.string(),
  notes:           z.string().optional(),
  tracking_number: z.string().optional(),
  container_id:    z.number().int().positive().optional(),
  shipping_cost:   z.number().nonnegative().optional(),
  box_count:       z.number().int().positive().optional(),
  photos_notes:    z.string().optional(),
})

// Acciones de recepción que un usuario normal puede ejecutar
const RECEPTION_STATUSES = new Set(['RESET_RECEPTION', 'UNDO'])

// Revierte del inventario lo efectivamente recibido de una importación (OUT negativo)
async function revertImportInventory(
  db: { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> },
  orderId: string, note: string, userId: number,
) {
  const { rows: items } = await db.query(`
    SELECT product_id,
      CASE WHEN COALESCE(total_received_qty,0) > 0 THEN total_received_qty
           ELSE COALESCE(received_qty,0) END AS effective_qty
    FROM import_order_items WHERE import_order_id=$1
  `, [orderId])
  for (const item of items) {
    const qty = parseInt(item.effective_qty, 10) || 0
    if (qty <= 0) continue
    await db.query(
      `UPDATE inventory SET quantity = GREATEST(0, quantity - $1), last_updated=NOW() WHERE product_id=$2`,
      [qty, item.product_id]
    )
    await db.query(
      `INSERT INTO inventory_movements (product_id, movement_type, quantity, reference, notes, created_by)
       VALUES ($1, 'OUT', $2, $3, $4, $5)`,
      [item.product_id, -qty, `Importación #${orderId}`, note, userId]
    )
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()

  try {
    const body   = Schema.parse(await req.json())
    const userId = parseInt(session.user.id, 10)

    // Usuarios normales solo pueden ejecutar acciones de recepción
    if (session.user.role !== 'admin' && !RECEPTION_STATUSES.has(body.status)) {
      return forbidden()
    }

    const { rows: [order] } = await db.query(
      `SELECT id, status FROM import_orders WHERE id = $1`, [id]
    )
    if (!order) return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 })

    const current = order.status as string
    let newStatus = body.status

    await db.query('BEGIN')
    try {
      if (newStatus === 'RESET_RECEPTION') {
        // Recepción: vuelve a EN_CAMINO, revierte inventario cargado, limpia recibidos.
        if (!['PARCIAL', 'RECIBIDA', 'FINALIZADA', 'INCONSISTENTE'].includes(current)) {
          await db.query('ROLLBACK')
          return NextResponse.json({ error: `No se puede reabrir la recepción desde ${current}` }, { status: 409 })
        }
        if (['PARCIAL', 'FINALIZADA', 'INCONSISTENTE'].includes(current)) {
          await revertImportInventory(db, id, 'Reapertura recepción', userId)
        }
        await db.query(`UPDATE import_order_items SET received_qty=0, total_received_qty=0 WHERE import_order_id=$1`, [id])
        await db.query(
          `UPDATE import_orders SET status='EN_CAMINO', received_by=NULL, received_at=NULL, updated_at=NOW() WHERE id=$1`, [id]
        )
        await db.query('COMMIT')
        return NextResponse.json({ ok: true, message: 'Recepción reabierta (EN_CAMINO)' })

      } else if (newStatus === 'UNDO') {
        // Deshacer último: un estado atrás.
        if (['FINALIZADA', 'INCONSISTENTE'].includes(current)) {
          await revertImportInventory(db, id, 'Deshacer finalización', userId)
          await db.query(`UPDATE import_orders SET status='RECIBIDA', updated_at=NOW() WHERE id=$1`, [id])
        } else if (current === 'RECIBIDA') {
          await db.query(`UPDATE import_order_items SET received_qty=0, total_received_qty=0 WHERE import_order_id=$1`, [id])
          await db.query(`UPDATE import_orders SET status='EN_CAMINO', received_by=NULL, received_at=NULL, updated_at=NOW() WHERE id=$1`, [id])
        } else if (current === 'PARCIAL') {
          await revertImportInventory(db, id, 'Deshacer recepción parcial', userId)
          await db.query(`UPDATE import_order_items SET received_qty=0, total_received_qty=0 WHERE import_order_id=$1`, [id])
          await db.query(`UPDATE import_orders SET status='EN_CAMINO', received_by=NULL, received_at=NULL, updated_at=NOW() WHERE id=$1`, [id])
        } else {
          await db.query('ROLLBACK')
          return NextResponse.json({ error: `No hay un cambio que deshacer desde ${current}` }, { status: 409 })
        }
        await db.query('COMMIT')
        return NextResponse.json({ ok: true, message: 'Último cambio deshecho' })

      } else if (newStatus === 'REABIERTA') {
        // Always revert to PENDIENTE
        newStatus = 'PENDIENTE'

        // Los archivos/fotos NO se borran al reabrir: son evidencia de la orden.

        // Reset payments for paid/advanced states
        const resetPayStates = ['PAGADA','EN_TRANSITO','ADUANA','EN_IMPORTADOR_PAGAR','EN_CAMINO','PARCIAL','FINALIZADA','INCONSISTENTE']
        if (resetPayStates.includes(current)) {
          await db.query(`
            UPDATE import_orders
            SET paid_50_done=FALSE, paid_50_at=NULL, paid_50_amount=NULL,
                paid_100_done=FALSE, paid_100_at=NULL, paid_100_amount=NULL,
                tracking_number=NULL, shipping_cost=NULL, box_count=NULL, shipping_paid_at=NULL
            WHERE id=$1
          `, [id])
        }

        // Reset received quantities for received/finalized/inconsistent
        if (['RECIBIDA','PARCIAL','FINALIZADA','INCONSISTENTE'].includes(current)) {
          // Revert inventory if stock was loaded (PARCIAL, FINALIZADA, INCONSISTENTE)
          if (['PARCIAL','FINALIZADA','INCONSISTENTE'].includes(current)) {
            const { rows: items } = await db.query(`
              SELECT product_id,
                CASE WHEN COALESCE(total_received_qty,0) > 0 THEN total_received_qty
                     ELSE COALESCE(received_qty,0) END AS effective_qty
              FROM import_order_items WHERE import_order_id=$1
            `, [id])
            for (const item of items) {
              const qty = parseInt(item.effective_qty, 10) || 0
              if (qty <= 0) continue
              await db.query(
                `UPDATE inventory SET quantity = GREATEST(0, quantity - $1), last_updated=NOW() WHERE product_id=$2`,
                [qty, item.product_id]
              )
              await db.query(
                `INSERT INTO inventory_movements (product_id, movement_type, quantity, reference, notes, created_by)
                 VALUES ($1, 'OUT', $2, $3, $4, $5)`,
                [item.product_id, -qty, `Importación #${id}`, 'Reversión por reapertura', userId]
              )
            }
          }
          await db.query(
            `UPDATE import_order_items SET received_qty=0, total_received_qty=0 WHERE import_order_id=$1`, [id]
          )
          // Also reset shipping/tracking for RECIBIDA
          if (current === 'RECIBIDA') {
            await db.query(
              `UPDATE import_orders SET shipping_cost=NULL, box_count=NULL, tracking_number=NULL, shipping_paid_at=NULL WHERE id=$1`, [id]
            )
          }
        }

      } else if (!IMPORT_FLOW.includes(newStatus)) {
        await db.query('ROLLBACK')
        return NextResponse.json({ error: `Estado inválido: ${newStatus}` }, { status: 400 })
      } else {
        // Validate INCONSISTENTE requires notes
        if (newStatus === 'INCONSISTENTE' && !body.notes?.trim()) {
          await db.query('ROLLBACK')
          return NextResponse.json(
            { error: 'Debe indicar en notas qué mercancía llegó incorrecta' },
            { status: 400 }
          )
        }

        // Fotos obligatorias: al salir de ESPERANDO_FOTOS y al pasar a EN_TRANSITO
        // (cubre el caso de pagar 100% directo y saltarse el paso de fotos).
        if (current === 'ESPERANDO_FOTOS' || newStatus === 'EN_TRANSITO') {
          const { rows: [fc] } = await db.query(
            `SELECT COUNT(*) AS n FROM import_order_files WHERE import_order_id=$1`, [id]
          )
          if (parseInt(fc.n, 10) === 0) {
            await db.query('ROLLBACK')
            return NextResponse.json(
              { error: 'Debes adjuntar al menos una foto antes de pasar a tránsito' },
              { status: 400 }
            )
          }
        }

        // Validate EN_CAMINO requires shipping_cost + box_count
        if (newStatus === 'EN_CAMINO') {
          if (!body.shipping_cost || body.shipping_cost <= 0) {
            await db.query('ROLLBACK')
            return NextResponse.json({ error: 'El costo de envío es obligatorio' }, { status: 400 })
          }
          if (!body.box_count || body.box_count <= 0) {
            await db.query('ROLLBACK')
            return NextResponse.json({ error: 'La cantidad de cajas es obligatoria' }, { status: 400 })
          }
        }
      }

      // Build extra SET fields
      const extra: string[] = []
      const vals: unknown[]  = [newStatus]

      if (newStatus === 'EN_TRANSITO' && body.tracking_number) {
        extra.push(`tracking_number=$${vals.length + 1}`)
        vals.push(body.tracking_number)
      }
      if (newStatus === 'EN_TRANSITO' && body.container_id) {
        extra.push(`container_id=$${vals.length + 1}`)
        vals.push(body.container_id)
      }
      if (newStatus === 'EN_CAMINO') {
        extra.push(`shipping_cost=$${vals.length + 1}`, `box_count=$${vals.length + 2}`, `shipping_paid_at=NOW()`)
        vals.push(body.shipping_cost, body.box_count)
      }
      if (body.photos_notes) {
        extra.push(`photos_notes=$${vals.length + 1}`)
        vals.push(body.photos_notes)
      }
      if (body.notes !== undefined) {
        extra.push(`notes=$${vals.length + 1}`)
        vals.push(body.notes)
      }
      vals.push(id)

      const extraSql = extra.length > 0 ? `, ${extra.join(', ')}` : ''
      await db.query(
        `UPDATE import_orders SET status=$1, updated_at=NOW()${extraSql} WHERE id=$${vals.length}`,
        vals
      )

      await db.query('COMMIT')
      return NextResponse.json({ ok: true, message: `Estado actualizado a ${newStatus}` })
    } catch (e) {
      await db.query('ROLLBACK')
      throw e
    }
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.message }, { status: 400 })
    return apiError(err)
  }
}
