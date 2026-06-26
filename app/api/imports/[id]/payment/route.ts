import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { z } from 'zod'
import { getSessionDb, unauthorized } from '@/lib/session'

const Schema = z.object({
  payment_step:    z.enum(['50', '100']),
  amount:          z.number().nonnegative(),
  tracking_number: z.string().optional(),   // requerido en el 100%
  container_id:    z.number().int().positive().optional(), // contenedor (CONTENEDOR-XXX)
})

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()

  try {
    const { payment_step, amount, tracking_number, container_id } = Schema.parse(await req.json())

    const { rows: [order] } = await db.query(
      `SELECT id, status FROM import_orders WHERE id = $1`, [id]
    )
    if (!order) return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 })

    if (payment_step === '50') {
      await db.query(
        `UPDATE import_orders
         SET paid_50_done=TRUE, paid_50_at=NOW(), paid_50_amount=$1, updated_at=NOW()
         WHERE id=$2`,
        [amount, id]
      )
      // Advance to PAGO_PARCIAL if still PENDIENTE
      if (order.status === 'PENDIENTE') {
        await db.query(`UPDATE import_orders SET status='PAGO_PARCIAL' WHERE id=$1`, [id])
      }
    } else {
      // Pago 100%: registra el pago, captura tracking + contenedor y mueve la
      // orden directo a EN_TRANSITO (ya va montada en contenedor y en camino).
      if (!tracking_number?.trim()) {
        return NextResponse.json({ error: 'El tracking es obligatorio al pagar el 100%' }, { status: 400 })
      }
      const sets: string[] = [
        'paid_100_done=TRUE', 'paid_100_at=NOW()', 'paid_100_amount=$1',
        'tracking_number=$2', 'updated_at=NOW()',
      ]
      const vals: unknown[] = [amount, tracking_number.trim()]
      if (container_id) {
        sets.push(`container_id=$${vals.length + 1}`)
        vals.push(container_id)
      }
      // Avanza a EN_TRANSITO desde cualquier estado previo al tránsito
      if (['PENDIENTE', 'PAGO_PARCIAL', 'ESPERANDO_FOTOS', 'PAGADA'].includes(order.status)) {
        sets.push(`status='EN_TRANSITO'`)
      }
      vals.push(id)
      await db.query(`UPDATE import_orders SET ${sets.join(', ')} WHERE id=$${vals.length}`, vals)
    }

    return NextResponse.json({ message: `Pago ${payment_step}% registrado exitosamente` })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.message }, { status: 400 })
    return apiError(err)
  }
}
