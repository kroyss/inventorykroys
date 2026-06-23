import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { z } from 'zod'
import { getSessionDb, unauthorized } from '@/lib/session'

const Schema = z.object({
  // 'REABIERTA' action → reverts sale to BORRADOR
  // 'PAGO_VERIFICADO' → verifies payment (LOCAL sales skip to DESCARGADA_LOCAL)
  // 'PROCESADA' → processes sale, deducts inventory
  status: z.enum(['PAGO_VERIFICADO', 'PROCESADA', 'REABIERTA']),
})

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()

  try {
    const { status: newStatus } = Schema.parse(await req.json())
    const userId = parseInt(session.user.id, 10)

    const { rows: [sale] } = await db.query(
      `SELECT id, status, ml_order_number, notes, COALESCE(reopen_count, 0) AS reopen_count
       FROM sales WHERE id = $1`,
      [id]
    )
    if (!sale) return NextResponse.json({ error: 'Venta no encontrada' }, { status: 404 })

    const current     = sale.status as string
    const reopenCount = parseInt(sale.reopen_count, 10)

    await db.query('BEGIN')
    try {
      if (newStatus === 'REABIERTA') {
        // Cannot reopen what is already open/draft
        if (['BORRADOR', 'REABIERTA'].includes(current)) {
          await db.query('ROLLBACK')
          return NextResponse.json(
            { error: 'La venta ya está abierta' },
            { status: 409 }
          )
        }

        // Revert inventory if stock was deducted
        if (['PROCESADA', 'DESCARGADA', 'DESCARGADA_LOCAL'].includes(current)) {
          const { rows: items } = await db.query(
            `SELECT product_id, quantity FROM sale_items WHERE sale_id = $1`,
            [id]
          )
          for (const item of items) {
            await db.query(
              `UPDATE inventory SET quantity = quantity + $1, last_updated = NOW()
               WHERE product_id = $2`,
              [item.quantity, item.product_id]
            )
            await db.query(
              `INSERT INTO inventory_movements
                 (product_id, movement_type, quantity, reference, notes, created_by)
               VALUES ($1, 'IN', $2, $3, $4, $5)`,
              [item.product_id, item.quantity, `Venta reabierta #${id}`,
               'Reversión por reapertura', userId]
            )
          }
        }

        const newCount   = reopenCount + 1
        const reopenTag  = newCount > 1 ? `[REABIERTA x${newCount}]` : '[REABIERTA]'
        const existingNotes = sale.notes || ''
        let updatedNotes: string
        if (!existingNotes) {
          updatedNotes = reopenTag
        } else if (!existingNotes.includes('[REABIERTA')) {
          updatedNotes = `${existingNotes} | ${reopenTag}`
        } else {
          updatedNotes = existingNotes.replace(/\[REABIERTA[^\]]*\]/, reopenTag)
        }

        await db.query(
          `UPDATE sales
           SET status='BORRADOR', reopened_at=NOW(), updated_at=NOW(),
               reopen_count=$1, notes=$2
           WHERE id=$3`,
          [newCount, updatedNotes, id]
        )

      } else if (newStatus === 'PAGO_VERIFICADO') {
        if (current !== 'BORRADOR') {
          await db.query('ROLLBACK')
          return NextResponse.json({ error: 'Solo se puede verificar desde BORRADOR' }, { status: 409 })
        }

        // LOCAL orders skip directly to DESCARGADA_LOCAL
        if ((sale.ml_order_number as string).startsWith('LOCAL-')) {
          const { rows: items } = await db.query(
            `SELECT si.product_id, si.quantity, p.name AS product_name
             FROM sale_items si JOIN products p ON p.id = si.product_id
             WHERE si.sale_id = $1`,
            [id]
          )
          // Validate stock first
          for (const item of items) {
            const { rows: [inv] } = await db.query(
              `SELECT quantity FROM inventory WHERE product_id = $1`,
              [item.product_id]
            )
            if (!inv) {
              await db.query('ROLLBACK')
              return NextResponse.json(
                { error: `Producto ${item.product_name} no tiene inventario` },
                { status: 400 }
              )
            }
            if (inv.quantity < item.quantity) {
              await db.query('ROLLBACK')
              return NextResponse.json(
                { error: `Stock insuficiente para '${item.product_name}'. Disponible: ${inv.quantity}, requerido: ${item.quantity}` },
                { status: 400 }
              )
            }
          }
          // Deduct stock
          for (const item of items) {
            await db.query(
              `UPDATE inventory SET quantity = quantity - $1, last_updated = NOW()
               WHERE product_id = $2`,
              [item.quantity, item.product_id]
            )
            await db.query(
              `INSERT INTO inventory_movements
                 (product_id, movement_type, quantity, reference, notes, created_by)
               VALUES ($1, 'OUT', $2, $3, $4, $5)`,
              [item.product_id, -item.quantity, `Venta LOCAL #${id}`,
               'Entrega personal / cobro destino', userId]
            )
          }
          await db.query(
            `UPDATE sales
             SET status='DESCARGADA_LOCAL',
                 payment_verified_by=$1, payment_verified_at=NOW(),
                 processed_by=$1, processed_at=NOW(), updated_at=NOW()
             WHERE id=$2`,
            [userId, id]
          )
          await db.query('COMMIT')
          return NextResponse.json({ ok: true, skip_to: 'DESCARGADA_LOCAL' })
        }

        await db.query(
          `UPDATE sales
           SET status='PAGO_VERIFICADO', payment_verified_by=$1, payment_verified_at=NOW(), updated_at=NOW()
           WHERE id=$2`,
          [userId, id]
        )

      } else if (newStatus === 'PROCESADA') {
        // CO no usa "verificar pago": se procesa directo desde BORRADOR.
        // VE mantiene el paso PAGO_VERIFICADO obligatorio.
        const isCO = session.user.country === 'CO'
        const allowedFrom = isCO ? ['BORRADOR', 'PAGO_VERIFICADO'] : ['PAGO_VERIFICADO']
        if (!allowedFrom.includes(current)) {
          await db.query('ROLLBACK')
          return NextResponse.json(
            { error: isCO ? 'Solo se puede procesar desde borrador' : 'Debe verificar el pago primero' },
            { status: 409 }
          )
        }

        const { rows: items } = await db.query(
          `SELECT si.product_id, si.quantity, p.name AS product_name
           FROM sale_items si JOIN products p ON p.id = si.product_id
           WHERE si.sale_id = $1`,
          [id]
        )
        // Validate stock first
        for (const item of items) {
          const { rows: [inv] } = await db.query(
            `SELECT quantity FROM inventory WHERE product_id = $1`,
            [item.product_id]
          )
          if (!inv) {
            await db.query('ROLLBACK')
            return NextResponse.json(
              { error: `Producto ${item.product_name} no tiene inventario registrado` },
              { status: 400 }
            )
          }
          if (inv.quantity < item.quantity) {
            await db.query('ROLLBACK')
            return NextResponse.json(
              { error: `Stock insuficiente para '${item.product_name}'. Disponible: ${inv.quantity}, requerido: ${item.quantity}` },
              { status: 400 }
            )
          }
        }
        // Deduct stock
        for (const item of items) {
          await db.query(
            `UPDATE inventory SET quantity = quantity - $1, last_updated = NOW()
             WHERE product_id = $2`,
            [item.quantity, item.product_id]
          )
          await db.query(
            `INSERT INTO inventory_movements
               (product_id, movement_type, quantity, reference, notes, created_by)
             VALUES ($1, 'OUT', $2, $3, $4, $5)`,
            [item.product_id, -item.quantity, `Venta ML #${id}`,
             'Descuento por venta procesada', userId]
          )
        }
        await db.query(
          `UPDATE sales
           SET status='PROCESADA', processed_by=$1, processed_at=NOW(), updated_at=NOW()
           WHERE id=$2`,
          [userId, id]
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
