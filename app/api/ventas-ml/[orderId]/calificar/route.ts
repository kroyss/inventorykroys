import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { sesionPreguntas } from '@/lib/preguntasSesion'
import { mlFetch, ErrorML } from '@/lib/ml'
import { buscarOrden, feedbackDeOrden, MOTIVOS_NO_CONCRETADA } from '@/lib/ventasML'

const Body = z.object({
  concretada: z.boolean(),
  calificacion: z.enum(['positive', 'neutral', 'negative']),
  mensaje: z.string().trim().min(1).max(160),
  motivo: z.string().optional(),
}).refine(b => b.concretada || (b.motivo && b.motivo in MOTIVOS_NO_CONCRETADA),
  { message: 'Si no se concretó, elige el motivo' })

// POST /api/ventas-ml/[orderId]/calificar → califica al comprador (público en ML).
// Solo administradores; se relee la calificación para confirmar que quedó.
export async function POST(req: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const s = await sesionPreguntas(true)
  if ('error' in s) return s.error
  const { orderId } = await params
  if (!/^\d{10,20}$/.test(orderId)) return NextResponse.json({ error: 'Número de venta inválido' }, { status: 400 })

  try {
    const b = Body.parse(await req.json())
    const r = await buscarOrden(s.db, orderId)
    if (!r) return NextResponse.json({ error: 'Ninguna de tus cuentas conectadas tiene esa venta' }, { status: 404 })
    const antes = await feedbackDeOrden(s.db, r.conexionId, orderId)
    if (antes.sale) return NextResponse.json({ error: 'Esta venta ya tiene tu calificación' }, { status: 409 })

    const cuerpo: Record<string, unknown> = { fulfilled: b.concretada, rating: b.calificacion, message: b.mensaje }
    if (!b.concretada) cuerpo.reason = b.motivo
    let respuestaML: unknown
    try {
      respuestaML = await mlFetch(s.db, r.conexionId, `/orders/${orderId}/feedback`, { method: 'POST', body: cuerpo })
    } catch (e) {
      if (e instanceof ErrorML) {
        console.error('[ML calificar]', orderId, e.status, JSON.stringify(e.datos))
        return NextResponse.json({ error: e.message, detalle: e.datos }, { status: 502 })
      }
      throw e
    }
    const despues = await feedbackDeOrden(s.db, r.conexionId, orderId)
    return NextResponse.json({ ok: !!despues.sale, calificacion: despues.sale, respuestaML })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message ?? err.message }, { status: 400 })
    return apiError(err)
  }
}
