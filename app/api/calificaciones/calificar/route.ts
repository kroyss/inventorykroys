import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { sesionPreguntas } from '@/lib/preguntasSesion'
import { mlFetch, ErrorML } from '@/lib/ml'
import { leerPlantillasCal } from '@/lib/calificacionesML'
import { esDemo } from '@/lib/demo'
import { registrarUso } from '@/lib/usoAcciones'

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
    const demo = await esDemo(s.db)   // lib/demo.ts: se registra sin llamar a MercadoLibre

    for (const o of ordenes) {
      const { rows: [fila] } = await s.db.query(
        `SELECT conexion_id, cal_vendedor, fecha::date > CURRENT_DATE - $2::int AS en_espera FROM ml_ordenes WHERE id = $1`,
        [o.id, p.esperaDias])
      if (!fila) { resultados.push({ id: o.id, ok: false, detalle: 'Venta no encontrada' }); continue }
      if (fila.en_espera) { resultados.push({ id: o.id, ok: false, detalle: `Todavía en los ${p.esperaDias} días de espera` }); continue }
      if (fila.cal_vendedor) { resultados.push({ id: o.id, ok: true, detalle: 'Ya estaba calificada' }); continue }
      const cuerpo = o.tipo === 'concretada'
        ? { fulfilled: true, rating: p.concretada.rating, message: p.concretada.mensaje }
        : { fulfilled: false, rating: p.noConcretada.rating, reason: p.noConcretada.motivo, message: p.noConcretada.mensaje }
      if (demo) {
        await s.db.query(`UPDATE ml_ordenes SET cal_vendedor = $2, cal_concretada = $3, actualizada_at = NOW() WHERE id = $1`,
          [o.id, cuerpo.rating, cuerpo.fulfilled])
        resultados.push({ id: o.id, ok: true })
        continue
      }
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
          resultados.push({ id: o.id, ok: false, detalle: msg })
          continue
        }
        // ML cierra la calificación del vendedor cuando el comprador ya calificó y pasó el plazo
        // (visto con SHOPIT_VE: compradores arrepentidos que calificaron el mismo día). Se confirma
        // releyendo: si el comprador calificó y ML rechazó (4xx, no sesión ni límite), sale de la lista.
        if (e instanceof ErrorML && e.status >= 400 && e.status < 500 && ![401, 429].includes(e.status)) {
          const v = await mlFetch<{ sale: unknown; purchase: { date_created?: string } | null }>(
            s.db, fila.conexion_id, `/orders/${o.id}/feedback`).catch(() => null)
          if (v?.purchase && !v.sale) {
            await s.db.query(`UPDATE ml_ordenes SET cal_vendedor = 'cerrada_ml' WHERE id = $1 AND cal_vendedor IS NULL`, [o.id])
            const f = v.purchase.date_created
            resultados.push({ id: o.id, ok: false, detalle:
              `MercadoLibre ya no permite calificarla (el comprador calificó${f ? ` el ${f.slice(8, 10)}/${f.slice(5, 7)}` : ''} y pasó el plazo). Se quitó de la lista.` })
            continue
          }
        }
        resultados.push({ id: o.id, ok: false, detalle: msg })
      }
    }
    await registrarUso(s.db, 'calificacion', resultados.filter(r => r.ok && r.detalle !== 'Ya estaba calificada').length)
    return NextResponse.json({ resultados })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.message }, { status: 400 })
    return apiError(err)
  }
}
