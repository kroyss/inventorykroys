import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { sesionPreguntas } from '@/lib/preguntasSesion'
import { mlFetch, ErrorML } from '@/lib/ml'
import { leerPlantillasCal } from '@/lib/calificacionesML'

const Body = z.object({
  ordenes: z.array(z.object({
    id: z.string().regex(/^\d{10,20}$/),
    tipo: z.enum(['concretada', 'no_concretada']),
  })).min(1).max(10),
})

// POST /api/calificaciones/calificar { ordenes: [{ id, tipo }] } → califica un lote chico
// (la pantalla repite). Usa los textos de la empresa; relee cada una para confirmar.
// Calificar es PÚBLICO en ML: lo dispara el administrador desde la pantalla, con confirmación.
export async function POST(req: NextRequest) {
  const s = await sesionPreguntas()
  if ('error' in s) return s.error
  try {
    const { ordenes } = Body.parse(await req.json())
    const { rows: [pl] } = await s.db.query(`SELECT value FROM app_settings WHERE key = 'calificaciones_plantillas'`)
    const p = leerPlantillasCal(pl?.value)
    const resultados: { id: string; ok: boolean; detalle?: string }[] = []

    for (const o of ordenes) {
      const { rows: [fila] } = await s.db.query(
        `SELECT conexion_id, cal_vendedor FROM ml_ordenes WHERE id = $1`, [o.id])
      if (!fila) { resultados.push({ id: o.id, ok: false, detalle: 'Venta no encontrada' }); continue }
      if (fila.cal_vendedor) { resultados.push({ id: o.id, ok: true, detalle: 'Ya estaba calificada' }); continue }
      const cuerpo = o.tipo === 'concretada'
        ? { fulfilled: true, rating: p.concretada.rating, message: p.concretada.mensaje }
        : { fulfilled: false, rating: p.noConcretada.rating, reason: p.noConcretada.motivo, message: p.noConcretada.mensaje }
      try {
        await mlFetch(s.db, fila.conexion_id, `/orders/${o.id}/feedback`, { method: 'POST', body: cuerpo })
        const v = await mlFetch<{ sale: { rating?: string; fulfilled?: boolean } | null }>(
          s.db, fila.conexion_id, `/orders/${o.id}/feedback`).catch(() => ({ sale: null }))
        await s.db.query(
          `UPDATE ml_ordenes SET cal_vendedor = $2, cal_concretada = $3, actualizada_at = NOW() WHERE id = $1`,
          [o.id, v.sale?.rating ?? cuerpo.rating, v.sale?.fulfilled ?? cuerpo.fulfilled])
        resultados.push({ id: o.id, ok: !!v.sale, detalle: v.sale ? undefined : 'ML no la mostró al releer' })
      } catch (e) {
        const msg = e instanceof ErrorML ? e.message : e instanceof Error ? e.message : String(e)
        // Si ML dice que ya existe, se registra como calificada para que salga de la lista.
        if (e instanceof ErrorML && /already|exist/i.test(JSON.stringify(e.datos ?? ''))) {
          await s.db.query(`UPDATE ml_ordenes SET cal_vendedor = COALESCE(cal_vendedor, 'ya_calificada') WHERE id = $1`, [o.id])
        }
        resultados.push({ id: o.id, ok: false, detalle: msg })
      }
    }
    return NextResponse.json({ resultados })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.message }, { status: 400 })
    return apiError(err)
  }
}
