import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { sesionPreguntas } from '@/lib/preguntasSesion'
import { calificarUna, type ResultadoCal } from '@/lib/calificacionesAuto'
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
    const resultados: ResultadoCal[] = []
    const demo = await esDemo(s.db)   // lib/demo.ts: se registra sin llamar a MercadoLibre

    for (const o of ordenes) resultados.push(await calificarUna(s.db, o.id, o.tipo, p, demo))
    await registrarUso(s.db, 'calificacion', resultados.filter(r => r.ok && r.detalle !== 'Ya estaba calificada').length)
    return NextResponse.json({ resultados })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.message }, { status: 400 })
    return apiError(err)
  }
}
