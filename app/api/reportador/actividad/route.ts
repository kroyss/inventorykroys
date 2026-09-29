import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { autenticarEquipo } from '@/lib/reportador'

const Schema = z.object({
  texto:    z.string().max(200).nullable(),
  orden_id: z.number().int().positive().nullable().optional(),
})

/**
 * POST /api/reportador/actividad — el equipo cuenta qué está haciendo ("SOLUCION-MC 5/40")
 * para mostrarlo en Despachos. La respuesta dice si desde la web pidieron detener.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await autenticarEquipo(req)
    if ('error' in auth) return auth.error
    const { db, equipo } = auth
    const b = Schema.parse(await req.json())
    await db.query(
      `UPDATE reportador_equipos SET actividad = $2, actividad_at = CASE WHEN $2::text IS NULL THEN NULL ELSE NOW() END
       WHERE id = $1`, [equipo.id, b.texto])
    let detener = false
    if (b.orden_id) {
      const { rows: [o] } = await db.query(
        `SELECT detener_at IS NOT NULL AS detener FROM reportador_ordenes WHERE id = $1 AND equipo_id = $2`,
        [b.orden_id, equipo.id])
      detener = !!o?.detener
    }
    return NextResponse.json({ ok: true, detener })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.message }, { status: 400 })
    return apiError(err)
  }
}
