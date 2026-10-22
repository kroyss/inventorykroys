import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { sesionPreguntas } from '@/lib/preguntasSesion'
import { leerCalificaciones } from '@/lib/reputacionML'
import { esDemo } from '@/lib/demo'

const Body = z.object({ ids: z.array(z.string().regex(/^\d{10,20}$/)).min(1).max(10) })

// POST /api/calificaciones/comprador { ids } → lo que dijo el comprador (concretada o no, positiva/neutral/
// negativa y su comentario) de ventas que ya te calificaron pero sin detalle guardado (22-10: la búsqueda de
// órdenes solo dice "calificada"; lib/reputacionML.ts lo lee solo en los últimos 60 días). Se lee una vez por
// venta: cal_recibida '' = ML no dio el detalle. La pantalla "Por calificar" lo pide de a lotes chicos.
export async function POST(req: NextRequest) {
  const s = await sesionPreguntas()
  if ('error' in s) return s.error
  try {
    const { ids } = Body.parse(await req.json())
    if (await esDemo(s.db)) return NextResponse.json({ resultados: [] })
    const { rows } = await s.db.query(
      `SELECT id::text, conexion_id FROM ml_ordenes
       WHERE id = ANY($1::bigint[]) AND cal_comprador IS NOT NULL AND cal_recibida IS NULL`, [ids])
    const resultados: { id: string; rating: string | null; concretada: boolean | null; mensaje: string | null }[] = []
    for (const o of rows) {
      try {
        const { recibida: cal } = await leerCalificaciones(s.db, o.conexion_id, o.id)
        await s.db.query(
          `UPDATE ml_ordenes SET cal_recibida = COALESCE($2, ''), cal_recibida_at = COALESCE($3::timestamptz, cal_recibida_at),
             cal_recibida_msg = COALESCE($4, cal_recibida_msg), cal_recibida_concretada = $5, cal_recibida_revisada_at = NOW()
           WHERE id = $1 AND cal_recibida IS NULL`,
          [o.id, cal?.rating ?? null, cal?.fecha ?? null, cal?.mensaje ?? null, cal?.concretada ?? null])
        resultados.push({ id: o.id, rating: cal?.rating ?? '', concretada: cal?.concretada ?? null, mensaje: cal?.mensaje ?? null })
      } catch (e) {
        // Sin conexión o sesión de ML vencida: queda sin leer y se intenta la próxima vez.
        console.error('[calificaciones comprador]', o.id, e instanceof Error ? e.message : e)
      }
    }
    return NextResponse.json({ resultados })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.message }, { status: 400 })
    return apiError(err)
  }
}
