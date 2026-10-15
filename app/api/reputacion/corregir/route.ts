import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { sesionPreguntas } from '@/lib/preguntasSesion'
import { forbidden } from '@/lib/session'
import { puede } from '@/lib/permisos'
import { esDemo } from '@/lib/demo'
import { ErrorML, mlFetch } from '@/lib/ml'
import { leerCalificaciones } from '@/lib/reputacionML'
import { leerPlantillasCal } from '@/lib/calificacionesML'

// Reputación → "Corregir" (2026-10-15): cambiar la calificación que LE DIMOS al comprador
// (PUT /feedback/{id} de ML, con fulfilled/rating/message). Pensado para las contradictorias: el
// comprador dijo que la venta SÍ se concretó y nosotros que NO.
//   GET  ?id=ORDEN → las dos calificaciones como están AHORA en ML (para armar la ventana).
//   POST { id, concretada, rating, mensaje } → la cambia y relee para confirmar.

async function acceso() {
  const s = await sesionPreguntas()
  if ('error' in s) return s
  if (!puede(s.session.user, 'ver_calificaciones')) return { error: forbidden() }
  return s
}

export async function GET(req: NextRequest) {
  const s = await acceso()
  if ('error' in s) return s.error
  const id = req.nextUrl.searchParams.get('id') ?? ''
  if (!/^\d{5,20}$/.test(id)) return NextResponse.json({ error: 'Venta inválida' }, { status: 400 })
  try {
    const { rows: [o] } = await s.db.query(
      `SELECT conexion_id, NULLIF(cal_vendedor, 'calificada') AS rating, cal_concretada, cal_vendedor_msg FROM ml_ordenes WHERE id = $1`, [id])
    if (!o) return NextResponse.json({ error: 'Venta no encontrada' }, { status: 404 })
    const { rows: [pl] } = await s.db.query(`SELECT value FROM app_settings WHERE key = 'calificaciones_plantillas'`)
    const plantillas = leerPlantillasCal(pl?.value)
    if (await esDemo(s.db)) {
      return NextResponse.json({ nuestra: { rating: o.rating, concretada: o.cal_concretada, mensaje: o.cal_vendedor_msg }, plantillas })
    }
    const { nuestra, recibida } = await leerCalificaciones(s.db, o.conexion_id, id)
    return NextResponse.json({ nuestra, recibida, plantillas })
  } catch (err) {
    if (err instanceof ErrorML) return NextResponse.json({ error: `MercadoLibre: ${err.message}` }, { status: 502 })
    return apiError(err)
  }
}

const Body = z.object({
  id: z.string().regex(/^\d{5,20}$/),
  concretada: z.boolean(),
  rating: z.enum(['positive', 'neutral', 'negative']),
  mensaje: z.string().trim().min(1, 'Escribe un comentario').max(159, 'MercadoLibre acepta hasta 159 caracteres'),
})

export async function POST(req: NextRequest) {
  const s = await acceso()
  if ('error' in s) return s.error
  const r = Body.safeParse(await req.json().catch(() => null))
  if (!r.success) return NextResponse.json({ error: r.error.issues[0]?.message ?? r.error.message }, { status: 400 })
  const { id, concretada, rating, mensaje } = r.data
  try {
    const { rows: [o] } = await s.db.query(`SELECT conexion_id FROM ml_ordenes WHERE id = $1`, [id])
    if (!o) return NextResponse.json({ error: 'Venta no encontrada' }, { status: 404 })

    if (await esDemo(s.db)) {
      await s.db.query(
        `UPDATE ml_ordenes SET cal_vendedor = $2, cal_concretada = $3, cal_vendedor_msg = $4,
                cal_contradictoria = CASE WHEN cal_recibida_concretada IS NULL THEN cal_contradictoria ELSE cal_recibida_concretada <> $3 END
         WHERE id = $1`, [id, rating, concretada, mensaje])
      return NextResponse.json({ ok: true, contradictoria: false })
    }

    const antes = await leerCalificaciones(s.db, o.conexion_id, id)
    if (!antes.nuestra) return NextResponse.json({ error: 'Todavía no calificaste esta venta: hazlo desde Calificaciones' }, { status: 409 })
    // "No concretada" lleva el motivo (el de la plantilla de la empresa).
    const { rows: [pl] } = await s.db.query(`SELECT value FROM app_settings WHERE key = 'calificaciones_plantillas'`)
    const motivo = leerPlantillasCal(pl?.value).noConcretada.motivo
    await mlFetch(s.db, o.conexion_id, `/feedback/${antes.nuestra.id}`, {
      method: 'PUT', body: { fulfilled: concretada, rating, message: mensaje, ...(concretada ? {} : { reason: motivo }) },
    })

    // Releer: lo que quedó de verdad en ML.
    const { nuestra, recibida } = await leerCalificaciones(s.db, o.conexion_id, id)
    const contradictoria = recibida?.concretada == null || nuestra?.concretada == null ? null : recibida.concretada !== nuestra.concretada
    await s.db.query(
      `UPDATE ml_ordenes SET cal_vendedor = COALESCE($2, cal_vendedor), cal_concretada = COALESCE($3, cal_concretada),
              cal_vendedor_msg = COALESCE($4, cal_vendedor_msg), cal_contradictoria = $5, actualizada_at = NOW()
       WHERE id = $1`, [id, nuestra?.rating ?? null, nuestra?.concretada ?? null, nuestra?.mensaje ?? null, contradictoria])
    const cambio = nuestra && (nuestra.concretada !== antes.nuestra.concretada || nuestra.rating !== antes.nuestra.rating || nuestra.mensaje !== antes.nuestra.mensaje)
    if (!cambio) return NextResponse.json({ error: 'MercadoLibre aceptó el pedido pero al releer la calificación sigue igual. Revísala en ML.' }, { status: 409 })
    return NextResponse.json({ ok: true, contradictoria, nuestra })
  } catch (err) {
    if (err instanceof ErrorML) return NextResponse.json({ error: `MercadoLibre no la dejó cambiar: ${err.message}` }, { status: 502 })
    return apiError(err)
  }
}
