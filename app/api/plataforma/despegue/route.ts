import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { dbGlobal } from '@/lib/db'
import { soloDueno } from '@/lib/plataforma'

// Programa Despegue en Plataforma (migración 112). Solo el dueño de la plataforma.
//   GET → el grupo que anuncia la página (cupos y tomados) + el embudo de la página (personas que entraron,
//         vieron el video y tocaron Telegram; total y de hoy, hora Caracas) y de dónde llegaron.
//   PUT { tomados } → el contador "Quedan X de 8": se sube a mano cada vez que alguien paga su cupo.

const HOY = `(v.fecha AT TIME ZONE 'America/Caracas')::date = (NOW() AT TIME ZONE 'America/Caracas')::date`

export async function GET() {
  const { error } = await soloDueno()
  if (error) return error
  try {
    const db = dbGlobal()
    const [{ rows: [grupo] }, { rows: [embudo] }, { rows: origenes }] = await Promise.all([
      db.query(`SELECT id, nombre, cupos, tomados, to_char(inicio, 'YYYY-MM-DD') AS inicio,
                       to_char(aparta_hasta, 'YYYY-MM-DD') AS aparta_hasta
                FROM despegue_grupos WHERE actual ORDER BY id DESC LIMIT 1`),
      db.query(
        `SELECT COUNT(DISTINCT navegador_id) FILTER (WHERE evento = 'vista')::int AS personas,
                COUNT(DISTINCT navegador_id) FILTER (WHERE evento = 'video')::int AS video,
                COUNT(DISTINCT navegador_id) FILTER (WHERE evento = 'telegram')::int AS telegram,
                COUNT(DISTINCT navegador_id) FILTER (WHERE evento = 'vista' AND ${HOY})::int AS personas_hoy,
                COUNT(DISTINCT navegador_id) FILTER (WHERE evento = 'telegram' AND ${HOY})::int AS telegram_hoy
         FROM despegue_visitas v`),
      db.query(
        `WITH primera AS (SELECT DISTINCT ON (navegador_id) navegador_id, origen FROM despegue_visitas ORDER BY navegador_id, fecha)
         SELECT p.origen, COUNT(*)::int AS personas,
                COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM despegue_visitas e
                                 WHERE e.navegador_id = p.navegador_id AND e.evento = 'telegram'))::int AS telegram
         FROM primera p GROUP BY 1 ORDER BY 2 DESC LIMIT 8`),
    ])
    return NextResponse.json({ grupo: grupo ?? null, embudo, origenes })
  } catch (err) {
    return apiError(err)
  }
}

const Body = z.object({ tomados: z.number().int().min(0).max(100) })

export async function PUT(req: NextRequest) {
  const { error } = await soloDueno()
  if (error) return error
  try {
    const { tomados } = Body.parse(await req.json())
    const { rows: [g] } = await dbGlobal().query(
      `UPDATE despegue_grupos SET tomados = LEAST($1, cupos), actualizado_at = NOW()
       WHERE id = (SELECT id FROM despegue_grupos WHERE actual ORDER BY id DESC LIMIT 1)
       RETURNING cupos, tomados`, [tomados])
    if (!g) return NextResponse.json({ error: 'No hay grupo' }, { status: 404 })
    return NextResponse.json(g)
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.message }, { status: 400 })
    return apiError(err)
  }
}
