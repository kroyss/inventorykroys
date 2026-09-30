import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { sesionPreguntas } from '@/lib/preguntasSesion'
import { mlFetch, ErrorML } from '@/lib/ml'
import { problemasDelTexto } from '@/lib/preguntasTexto'
import { buscarOrden, mensajesDeOrden } from '@/lib/ventasML'

const Body = z.object({ texto: z.string().trim().min(1).max(350) })

// POST /api/ventas-ml/[orderId]/mensaje → le escribe al comprador por la mensajería de la
// venta. Se relee la conversación para ver si quedó y con qué moderación.
export async function POST(req: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const s = await sesionPreguntas(true)
  if ('error' in s) return s.error
  const { orderId } = await params
  if (!/^\d{10,20}$/.test(orderId)) return NextResponse.json({ error: 'Número de venta inválido' }, { status: 400 })

  try {
    const { texto } = Body.parse(await req.json())
    const problemas = problemasDelTexto(texto)
    if (problemas.length) return NextResponse.json({ error: 'MercadoLibre rechazaría este mensaje', problemas }, { status: 422 })
    const r = await buscarOrden(s.db, orderId)
    if (!r) return NextResponse.json({ error: 'Ninguna de tus cuentas conectadas tiene esa venta' }, { status: 404 })
    const o = r.orden
    try {
      await mlFetch(s.db, r.conexionId, `/messages/packs/${o.pack_id ?? o.id}/sellers/${o.seller.id}?tag=post_sale`, {
        method: 'POST',
        body: { from: { user_id: o.seller.id }, to: { user_id: o.buyer.id }, text: texto },
      })
    } catch (e) {
      if (e instanceof ErrorML) {
        console.error('[ML mensaje]', orderId, e.status, JSON.stringify(e.datos))
        return NextResponse.json({ error: e.message, detalle: e.datos }, { status: 502 })
      }
      throw e
    }
    const mensajes = await mensajesDeOrden(s.db, r.conexionId, o).catch(() => null)
    const ultimo = mensajes?.filter(m => m.propio).pop() ?? null
    return NextResponse.json({ ok: true, ultimo, mensajes })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message ?? err.message }, { status: 400 })
    return apiError(err)
  }
}
