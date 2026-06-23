import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { z } from 'zod'
import { getSessionDb, unauthorized, forbidden } from '@/lib/session'

const Schema = z.object({
  action: z.enum(['advance', 'reopen', 'inconsistente', 'finalize', 'reset_reception', 'undo']),
  note: z.string().optional(),
})

// Reception actions a normal (non-admin) user may perform.
// finalize carga el inventario al confirmar la recepción (lo hace el receptor).
const RECEPTION_ACTIONS = new Set(['reset_reception', 'undo', 'finalize'])

// Revierte del inventario las cantidades efectivamente recibidas de una orden,
// registrando movimientos OUT (con signo negativo, convención legacy).
async function revertLoadedInventory(
  db: { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> },
  orderId: string, orderNumber: string, note: string, userId: number,
) {
  const { rows: items } = await db.query(
    `SELECT product_id,
            CASE WHEN COALESCE(total_received_qty, 0) > 0 THEN total_received_qty
                 WHEN received_qty IS NOT NULL AND received_qty > 0 THEN received_qty
                 ELSE 0 END AS effective_received
     FROM purchase_order_items
     WHERE purchase_order_id = $1`,
    [orderId]
  )
  for (const item of items) {
    if (item.effective_received <= 0) continue
    await db.query(
      `UPDATE inventory SET quantity = GREATEST(0, quantity - $1), last_updated = NOW() WHERE product_id = $2`,
      [item.effective_received, item.product_id]
    )
    await db.query(
      `INSERT INTO inventory_movements (product_id, movement_type, quantity, reference, notes, created_by)
       VALUES ($1, 'OUT', $2, $3, $4, $5)`,
      [item.product_id, -item.effective_received, orderNumber, note, userId]
    )
  }
}

// Only simple sequential advances (EN_CAMINO→RECIBIDA is via /receive)
const TRANSITIONS: Record<string, string> = {
  PENDIENTE: 'PAGADA',
  REABIERTA: 'PAGADA',
  PAGADA:    'EN_CAMINO',
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()

  try {
    const { action, note } = Schema.parse(await req.json())

    // Non-admin users may only perform reception actions (reset_reception, undo)
    if (session.user.role !== 'admin' && !RECEPTION_ACTIONS.has(action)) {
      return forbidden()
    }

    const { rows: [order] } = await db.query(
      `SELECT po.*, s.name AS supplier_name
       FROM purchase_orders po
       LEFT JOIN suppliers s ON po.supplier_id = s.id
       WHERE po.id = $1`,
      [id]
    )
    if (!order) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

    const userId = parseInt(session.user.id, 10)

    await db.query('BEGIN')
    try {
      if (action === 'advance') {
        const next = TRANSITIONS[order.status]
        if (!next) {
          await db.query('ROLLBACK')
          return NextResponse.json({ error: `No se puede avanzar desde ${order.status}` }, { status: 409 })
        }
        // Al pasar a PAGADA, registrar el pago = total de la orden si aún no se cargó
        // (el monto pagado no puede quedar en 0). Respeta un pago parcial ya ingresado.
        if (next === 'PAGADA') {
          await db.query(
            `UPDATE purchase_orders
             SET status = $1,
                 total_paid = CASE WHEN COALESCE(total_paid, 0) = 0 THEN total_usd ELSE total_paid END
             WHERE id = $2`,
            [next, id]
          )
        } else {
          await db.query(`UPDATE purchase_orders SET status = $1 WHERE id = $2`, [next, id])
        }

      } else if (action === 'finalize' || action === 'inconsistente') {
        const target = action === 'finalize' ? 'FINALIZADA' : 'INCONSISTENTE'
        if (!['RECIBIDA', 'PARCIAL'].includes(order.status)) {
          await db.query('ROLLBACK')
          return NextResponse.json(
            { error: `Solo se puede ${action === 'finalize' ? 'finalizar' : 'marcar inconsistente'} desde RECIBIDA o PARCIAL` },
            { status: 409 }
          )
        }
        if (action === 'inconsistente' && !note?.trim()) {
          await db.query('ROLLBACK')
          return NextResponse.json({ error: 'Se requiere nota para marcar inconsistente' }, { status: 400 })
        }

        const { rows: items } = await db.query(
          `SELECT poi.product_id, p.name AS product_name, poi.quantity,
                  COALESCE(poi.total_received_qty, 0) AS total_received_qty,
                  COALESCE(poi.received_qty, 0)       AS received_qty
           FROM purchase_order_items poi
           JOIN products p ON p.id = poi.product_id
           WHERE poi.purchase_order_id = $1`,
          [id]
        )

        const diffs: string[] = []
        let anyIncomplete = false

        for (const item of items) {
          const received = item.total_received_qty > 0
            ? item.total_received_qty
            : item.received_qty > 0
              ? item.received_qty
              : item.quantity

          // PARCIAL ya cargó inventario en cada recepción; RECIBIDA lo carga ahora.
          // INCONSISTENTE carga igual que FINALIZADA (paridad con legacy) — así el
          // reopen posterior revierte exactamente lo que se cargó.
          const toLoad = order.status === 'PARCIAL' ? 0 : received

          if (toLoad > 0) {
            const { rows: [inv] } = await db.query(
              `SELECT id FROM inventory WHERE product_id = $1`, [item.product_id]
            )
            if (inv) {
              await db.query(
                `UPDATE inventory SET quantity = quantity + $1, last_updated = NOW() WHERE product_id = $2`,
                [toLoad, item.product_id]
              )
            } else {
              await db.query(
                `INSERT INTO inventory (product_id, quantity, min_stock, max_stock, sale_price)
                 VALUES ($1, $2, 0, 0, 0)`,
                [item.product_id, toLoad]
              )
            }
            await db.query(
              `INSERT INTO inventory_movements
                 (product_id, movement_type, quantity, reference, notes, created_by)
               VALUES ($1, 'IN', $2, $3, $4, $5)`,
              [item.product_id, toLoad, order.order_number,
               `${target === 'FINALIZADA' ? 'Finalización' : 'Inconsistencia'} compra ${order.order_number}`, userId]
            )
          }

          if (received !== item.quantity) {
            anyIncomplete = true
            const diff = received - item.quantity
            const sign = diff > 0 ? '+' : ''
            diffs.push(`${item.product_name}: pedido ${item.quantity}, recibido ${received} (${sign}${diff})`)
          }
        }

        const diffNote = diffs.length > 0 ? `[DIFERENCIAS] ${diffs.join('; ')}` : null
        const incNote  = action === 'inconsistente' ? `[INCONSISTENTE] ${note!.trim()}` : null
        const combined = [diffNote, incNote].filter(Boolean).join(' | ') || null
        const isInc    = target === 'INCONSISTENTE' ? true : anyIncomplete

        await db.query(
          `UPDATE purchase_orders
           SET status = $1,
               is_incomplete = $2,
               incomplete_note = $3,
               notes = CASE WHEN $4::text IS NOT NULL
                            THEN CONCAT(COALESCE(notes, ''), ' | ', $4::text)
                            ELSE notes END
           WHERE id = $5`,
          [target, isInc, action === 'inconsistente' ? note!.trim() : null, combined, id]
        )

      } else if (action === 'reopen') {
        const canReopen = ['PAGADA', 'EN_CAMINO', 'RECIBIDA', 'PARCIAL', 'FINALIZADA', 'INCONSISTENTE']
        if (!canReopen.includes(order.status)) {
          await db.query('ROLLBACK')
          return NextResponse.json({ error: `No se puede reabrir desde ${order.status}` }, { status: 409 })
        }

        // Revert inventory only if stock was already loaded (PARCIAL, FINALIZADA, INCONSISTENTE)
        if (['PARCIAL', 'FINALIZADA', 'INCONSISTENTE'].includes(order.status)) {
          // Use item quantities — same approach as legacy — more reliable than querying movements
          const { rows: items } = await db.query(
            `SELECT product_id,
                    CASE
                      WHEN COALESCE(total_received_qty, 0) > 0 THEN total_received_qty
                      WHEN received_qty IS NOT NULL AND received_qty > 0 THEN received_qty
                      ELSE 0
                    END AS effective_received
             FROM purchase_order_items
             WHERE purchase_order_id = $1`,
            [id]
          )
          for (const item of items) {
            if (item.effective_received <= 0) continue
            await db.query(
              `UPDATE inventory
               SET quantity = GREATEST(0, quantity - $1), last_updated = NOW()
               WHERE product_id = $2`,
              [item.effective_received, item.product_id]
            )
            await db.query(
              `INSERT INTO inventory_movements
                 (product_id, movement_type, quantity, reference, notes, created_by)
               VALUES ($1, 'OUT', $2, $3, $4, $5)`,
              [item.product_id, -item.effective_received, order.order_number,
               `Reapertura ${order.order_number}`, userId]
            )
          }
        }

        // Reset received quantities on items
        await db.query(
          `UPDATE purchase_order_items
           SET received_qty = 0, total_received_qty = 0
           WHERE purchase_order_id = $1`,
          [id]
        )
        await db.query(
          `UPDATE purchase_orders
           SET status        = 'PENDIENTE',
               reopen_count  = reopen_count + 1,
               is_incomplete = FALSE,
               incomplete_note = NULL,
               received_by   = NULL,
               received_at   = NULL
           WHERE id = $1`,
          [id]
        )

      } else if (action === 'reset_reception') {
        // Usuario de recepción: vuelve a EN_CAMINO, revierte inventario cargado y limpia recibidos.
        // NO toca pagos/tracking (eso es del admin).
        if (!['PARCIAL', 'RECIBIDA', 'FINALIZADA', 'INCONSISTENTE'].includes(order.status)) {
          await db.query('ROLLBACK')
          return NextResponse.json({ error: `No se puede reabrir la recepción desde ${order.status}` }, { status: 409 })
        }
        // Inventario cargado en PARCIAL/FINALIZADA/INCONSISTENTE (RECIBIDA aún no carga)
        if (['PARCIAL', 'FINALIZADA', 'INCONSISTENTE'].includes(order.status)) {
          await revertLoadedInventory(db, id, order.order_number, 'Reapertura recepción', userId)
        }
        await db.query(
          `UPDATE purchase_order_items SET received_qty = 0, total_received_qty = 0 WHERE purchase_order_id = $1`, [id]
        )
        await db.query(
          `UPDATE purchase_orders
           SET status = 'EN_CAMINO', is_incomplete = FALSE, incomplete_note = NULL,
               received_by = NULL, received_at = NULL
           WHERE id = $1`,
          [id]
        )

      } else if (action === 'undo') {
        // Deshacer último cambio = volver al estado anterior (un paso atrás).
        // FINALIZADA/INCONSISTENTE → RECIBIDA (revierte carga, conserva cantidades para re-finalizar)
        // RECIBIDA → EN_CAMINO (sin inventario que revertir, limpia cantidades)
        // PARCIAL  → EN_CAMINO (revierte inventario cargado en parciales, limpia cantidades)
        if (['FINALIZADA', 'INCONSISTENTE'].includes(order.status)) {
          await revertLoadedInventory(db, id, order.order_number, 'Deshacer finalización', userId)
          // conserva received_qty/total_received_qty para poder re-finalizar
          await db.query(
            `UPDATE purchase_orders SET status = 'RECIBIDA', is_incomplete = FALSE, incomplete_note = NULL WHERE id = $1`,
            [id]
          )
        } else if (order.status === 'RECIBIDA') {
          await db.query(
            `UPDATE purchase_order_items SET received_qty = 0, total_received_qty = 0 WHERE purchase_order_id = $1`, [id]
          )
          await db.query(
            `UPDATE purchase_orders SET status = 'EN_CAMINO', received_by = NULL, received_at = NULL WHERE id = $1`, [id]
          )
        } else if (order.status === 'PARCIAL') {
          await revertLoadedInventory(db, id, order.order_number, 'Deshacer recepción parcial', userId)
          await db.query(
            `UPDATE purchase_order_items SET received_qty = 0, total_received_qty = 0 WHERE purchase_order_id = $1`, [id]
          )
          await db.query(
            `UPDATE purchase_orders SET status = 'EN_CAMINO', received_by = NULL, received_at = NULL WHERE id = $1`, [id]
          )
        } else {
          await db.query('ROLLBACK')
          return NextResponse.json({ error: `No hay un cambio que deshacer desde ${order.status}` }, { status: 409 })
        }
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
