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
  posicion_seg: z.number().int().min(0).max(36000).default(0),
})

// POST /api/aprendizaje/progreso → guarda cuánto se vio (nunca baja) y dónde quedó. Al llegar al 80%
// queda completado. También llega por navigator.sendBeacon al cerrar o recargar la página.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return unauthorized()
  try {
    const b = Body.parse(JSON.parse(await req.text()))
    const visto = Math.min(b.visto_seg, b.duracion_seg)
    const { rows: [r] } = await dbGlobal().query(
      `INSERT INTO aprendizaje_progreso (user_id, video_id, visto_seg, duracion_seg, posicion_seg, completado_at)
       SELECT $1::int, v.id, $3::int, $4::int, $6::int, CASE WHEN $3::int >= $4::int * $5::numeric THEN NOW() END
       FROM aprendizaje_videos v WHERE v.id = $2::int AND v.activo
         -- en orden: no cuenta si hay un video ANTERIOR de la misma serie sin completar
         AND NOT EXISTS (SELECT 1 FROM aprendizaje_videos a
                         LEFT JOIN aprendizaje_progreso pa ON pa.video_id = a.id AND pa.user_id = $1::int
                         WHERE a.activo AND a.serie = v.serie AND (a.orden, a.id) < (v.orden, v.id) AND pa.completado_at IS NULL)
       ON CONFLICT (user_id, video_id) DO UPDATE SET
         visto_seg     = GREATEST(aprendizaje_progreso.visto_seg, EXCLUDED.visto_seg),
         duracion_seg  = EXCLUDED.duracion_seg,
         posicion_seg  = EXCLUDED.posicion_seg,
         completado_at = COALESCE(aprendizaje_progreso.completado_at,
                                  CASE WHEN GREATEST(aprendizaje_progreso.visto_seg, EXCLUDED.visto_seg) >= EXCLUDED.duracion_seg * $5::numeric
                                       THEN NOW() END),
         updated_at    = NOW()
       RETURNING completado_at IS NOT NULL AS completado`,
      [Number(session.user.id), b.video_id, visto, b.duracion_seg, PORCENTAJE_COMPLETO, Math.min(b.posicion_seg, b.duracion_seg)])
    if (!r) return NextResponse.json({ error: 'Video no encontrado o todavía bloqueado (primero termina el anterior)' }, { status: 404 })
    // Video sin duración cargada en Plataforma: la toma del reproductor (se muestra en la lista).
    await dbGlobal().query(`UPDATE aprendizaje_videos SET duracion_seg = $2 WHERE id = $1 AND duracion_seg IS NULL`, [b.video_id, b.duracion_seg])
    return NextResponse.json({ completado: r.completado })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message }, { status: 400 })
    return apiError(err)
  }
}
