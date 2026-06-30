import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { z } from 'zod'
import { getSessionDb, unauthorized } from '@/lib/session'

// El monto ya no se pide: se calcula desde el total de la orden (costo de
// producto). 50% = la mitad; 100% = lo que falta (total − lo ya pagado).
const Schema = z.object({
  payment_step: z.enum(['50', '100']),
})

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()

  try {
    const { payment_step } = Schema.parse(await req.json())

    const { rows: [order] } = await db.query(
      `SELECT id, status, total_usd::float AS total_usd,
              paid_50_done, paid_50_amount::float AS paid_50_amount
       FROM import_orders WHERE id = $1`, [id]
    )
    if (!order) return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 })

    const total = order.total_usd ?? 0

    if (payment_step === '50') {
      const amount = total / 2
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
      // 100% = lo que falta (si ya hubo 50%, el resto; si no, el total completo)
      const already = order.paid_50_done ? (order.paid_50_amount ?? 0) : 0
      const amount = Math.max(0, total - already)
      await db.query(
        `UPDATE import_orders
         SET paid_100_done=TRUE, paid_100_at=NOW(), paid_100_amount=$1, updated_at=NOW()
         WHERE id=$2`,
        [amount, id]
      )
      // Advance to PAGADA if in early states (tracking/contenedor van en el paso siguiente)
      if (['PENDIENTE', 'PAGO_PARCIAL', 'ESPERANDO_FOTOS'].includes(order.status)) {
        await db.query(`UPDATE import_orders SET status='PAGADA' WHERE id=$1`, [id])
      }
    }

    return NextResponse.json({ message: `Pago ${payment_step}% registrado exitosamente` })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.message }, { status: 400 })
    return apiError(err)
  }
}
