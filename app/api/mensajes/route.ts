import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { sesionPreguntas } from '@/lib/preguntasSesion'
import { leerMensajesRapidos, MENSAJES_SUGERIDOS } from '@/lib/mensajesRapidos'

// GET /api/mensajes?vista=sin_leer|con_nota|todas → conversaciones post-venta de las cuentas de
// la empresa (las sin leer primero) con el estado de la venta en el sistema y sus notas de ML.
export async function GET(req: NextRequest) {
  const s = await sesionPreguntas()
  if ('error' in s) return s.error
  const vista = new URL(req.url).searchParams.get('vista')
  const filtro = vista === 'todas' ? '' : vista === 'con_nota' ? 'WHERE c.notas IS NOT NULL' : 'WHERE c.sin_leer > 0'
  try {
    const { rows } = await s.db.query(
      `SELECT c.pack_id::text, c.sin_leer, c.ultimo_texto, c.ultimo_de_comprador, c.ultimo_at, c.productos, c.notas,
              NULLIF(c.comprador_nick, '') AS comprador_nick, c.comprador_nombre,
              x.nickname AS cuenta, v.status AS venta_estado
       FROM ml_conversaciones c
       JOIN ml_conexiones x ON x.id = c.conexion_id
       LEFT JOIN sales v ON v.ml_order_number = c.pack_id::text
       ${filtro}
       ORDER BY (c.sin_leer > 0) DESC, c.ultimo_at DESC NULLS LAST
       LIMIT 200`)
    const { rows: [n] } = await s.db.query(
      `SELECT COUNT(*) FILTER (WHERE sin_leer > 0)::int AS conversaciones, COALESCE(SUM(sin_leer), 0)::int AS mensajes,
              COUNT(*) FILTER (WHERE notas IS NOT NULL)::int AS con_nota
       FROM ml_conversaciones`)
    // Respuestas rápidas (botones en cada conversación); `sugeridas` = ejemplos para el editor.
    const { rows: [pl] } = await s.db.query(`SELECT value FROM app_settings WHERE key = 'mensajes_plantillas'`)
    return NextResponse.json({
      conversaciones: rows, sin_leer: n, rapidas: leerMensajesRapidos(pl?.value), esAdmin: s.session.user.role === 'admin',
      sugeridas: MENSAJES_SUGERIDOS,
    })
  } catch (err) {
    return apiError(err)
  }
}
