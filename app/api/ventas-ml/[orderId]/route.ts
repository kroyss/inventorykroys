import { NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { sesionPreguntas } from '@/lib/preguntasSesion'
import { buscarOrden, feedbackDeOrden, mensajesDeOrden } from '@/lib/ventasML'

// GET /api/ventas-ml/[orderId] → la venta en ML (productos, calificación, mensajes) y su
// estado en el sistema. Solo lectura.
export async function GET(_req: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const s = await sesionPreguntas(true)
  if ('error' in s) return s.error
  const { orderId } = await params
  if (!/^\d{10,20}$/.test(orderId)) return NextResponse.json({ error: 'Número de venta inválido' }, { status: 400 })

  try {
    const r = await buscarOrden(s.db, orderId)
    if (!r) return NextResponse.json({ error: 'Ninguna de tus cuentas conectadas tiene esa venta' }, { status: 404 })
    const [fb, msgs, { rows: [enSistema] }] = await Promise.all([
      feedbackDeOrden(s.db, r.conexionId, orderId),
      mensajesDeOrden(s.db, r.conexionId, r.orden).catch(() => null),
      s.db.query(`SELECT status, created_at FROM sales WHERE ml_order_number = $1`, [orderId]),
    ])
    const o = r.orden
    return NextResponse.json({
      cuenta: r.cuenta,
      orden: {
        id: String(o.id), fecha: o.date_created, estado: o.status, tags: o.tags,
        total: o.total_amount, moneda: o.currency_id, comprador: o.buyer.nickname ?? null,
        productos: o.order_items.map(i => ({ titulo: i.item.title, cantidad: i.quantity })),
      },
      calificacion: fb.sale, calificacion_comprador: fb.purchase,
      mensajes: msgs, sistema: enSistema ?? null,
    })
  } catch (err) {
    return apiError(err)
  }
}
