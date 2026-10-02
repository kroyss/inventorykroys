import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { apiError } from '@/lib/apiError'
import { dbGlobal } from '@/lib/db'
import { unauthorized } from '@/lib/session'
import { PORCENTAJE_COMPLETO } from '@/lib/aprendizaje'

const Body = z.object({
  video_id: z.number().int().positive(),
  visto_seg: z.number().int().min(0).max(36000),
  duracion_seg: z.number().int().min(1).max(36000),
})

// POST /api/aprendizaje/progreso → guarda cuánto se vio (nunca baja). Al llegar al 90% queda completado.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return unauthorized()
  try {
    const b = Body.parse(await req.json())
    const visto = Math.min(b.visto_seg, b.duracion_seg)
    const { rows: [r] } = await dbGlobal().query(
      `INSERT INTO aprendizaje_progreso (user_id, video_id, visto_seg, duracion_seg, completado_at)
       SELECT $1, v.id, $3, $4, CASE WHEN $3 >= $4 * $5 THEN NOW() END
       FROM aprendizaje_videos v WHERE v.id = $2 AND v.activo
       ON CONFLICT (user_id, video_id) DO UPDATE SET
         visto_seg     = GREATEST(aprendizaje_progreso.visto_seg, EXCLUDED.visto_seg),
         duracion_seg  = EXCLUDED.duracion_seg,
         completado_at = COALESCE(aprendizaje_progreso.completado_at,
                                  CASE WHEN GREATEST(aprendizaje_progreso.visto_seg, EXCLUDED.visto_seg) >= EXCLUDED.duracion_seg * $5
                                       THEN NOW() END),
         updated_at    = NOW()
       RETURNING completado_at IS NOT NULL AS completado`,
      [Number(session.user.id), b.video_id, visto, b.duracion_seg, PORCENTAJE_COMPLETO])
    if (!r) return NextResponse.json({ error: 'Video no encontrado' }, { status: 404 })
    return NextResponse.json({ completado: r.completado })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message }, { status: 400 })
    return apiError(err)
  }
}
