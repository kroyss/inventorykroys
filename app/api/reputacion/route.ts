import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { sesionPreguntas } from '@/lib/preguntasSesion'
import { forbidden } from '@/lib/session'
import { puede } from '@/lib/permisos'
import { DIAS_AVISO } from '@/lib/reputacionML'

// Automatizaciones → Reputación (lib/reputacionML.ts).
// GET  → termómetro de cada cuenta + neutrales/negativas de los últimos DIAS_AVISO días (y las que se cambiaron).
// POST → { id, vista } marca (o desmarca) una calificación como vista: deja de contar en el menú.
export async function GET() {
  const s = await sesionPreguntas()
  if ('error' in s) return s.error
  if (!puede(s.session.user, 'ver_reputacion')) return forbidden()
  try {
    const { rows: cuentas } = await s.db.query(
      `SELECT id, nickname, reputacion, reputacion_at FROM ml_conexiones WHERE estado = 'activa' ORDER BY id`)
    const { rows: calificaciones } = await s.db.query(
      `SELECT o.id::text, COALESCE(o.pack_id, o.id)::text AS pack, x.nickname AS cuenta, x.id AS conexion_id,
              COALESCE(NULLIF(o.comprador_nombre, ''), NULLIF(c.comprador_nombre, '')) AS nombre, o.comprador AS nick,
              o.productos, o.fecha, o.cal_recibida AS rating, o.cal_recibida_antes AS antes, o.cal_recibida_at AS calificada_at,
              o.cal_recibida_msg AS mensaje, o.cal_recibida_vista_at AS vista_at,
              GREATEST(0, CEIL(EXTRACT(EPOCH FROM (o.cal_recibida_at + make_interval(days => $1) - NOW())) / 86400))::int AS dias_restantes,
              c.pack_id IS NOT NULL AS con_mensajes
       FROM ml_ordenes o
       JOIN ml_conexiones x ON x.id = o.conexion_id
       LEFT JOIN ml_conversaciones c ON c.pack_id = COALESCE(o.pack_id, o.id)
       WHERE o.cal_recibida_at > NOW() - make_interval(days => $1)
         AND (o.cal_recibida IN ('neutral', 'negative') OR o.cal_recibida_antes IS NOT NULL)
       ORDER BY o.cal_recibida_at DESC`, [DIAS_AVISO])
    const { rows: [pend] } = await s.db.query(
      `SELECT COUNT(*) FILTER (WHERE cal_comprador IS NOT NULL AND cal_recibida IS NULL AND fecha > NOW() - INTERVAL '60 days')::int AS n
       FROM ml_ordenes`)
    return NextResponse.json({ cuentas, calificaciones, dias: DIAS_AVISO, pais: s.session.user.country, por_revisar: pend?.n ?? 0 })
  } catch (err) {
    return apiError(err)
  }
}

const Body = z.object({ id: z.string().regex(/^\d{5,20}$/), vista: z.boolean() })

export async function POST(req: NextRequest) {
  const s = await sesionPreguntas()
  if ('error' in s) return s.error
  if (!puede(s.session.user, 'ver_reputacion')) return forbidden()
  try {
    const { id, vista } = Body.parse(await req.json())
    await s.db.query(`UPDATE ml_ordenes SET cal_recibida_vista_at = CASE WHEN $2 THEN NOW() END WHERE id = $1`, [id, vista])
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message ?? err.message }, { status: 400 })
    return apiError(err)
  }
}
