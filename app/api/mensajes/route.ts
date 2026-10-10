import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { sesionPreguntas } from '@/lib/preguntasSesion'
import { leerMensajesRapidos, MENSAJES_SUGERIDOS } from '@/lib/mensajesRapidos'
import { tieneModulo } from '@/lib/modulos'

// GET /api/mensajes?vista=sin_leer|con_nota|todas → conversaciones post-venta de las cuentas de
// la empresa (las sin leer primero) con su estado en Despachos (o cancelada en ML) y sus notas de ML.
export async function GET(req: NextRequest) {
  const s = await sesionPreguntas()
  if ('error' in s) return s.error
  const vista = new URL(req.url).searchParams.get('vista')
  const filtro = vista === 'todas' ? '' : vista === 'con_nota' ? 'WHERE c.notas IS NOT NULL' : 'WHERE c.sin_leer > 0'
  try {
    const { rows } = await s.db.query(
      `SELECT c.pack_id::text, c.sin_leer, c.ultimo_texto, c.ultimo_de_comprador, c.ultimo_at, c.productos, c.notas,
              NULLIF(c.comprador_nick, '') AS comprador_nick, c.comprador_nombre,
              x.nickname AS cuenta, d.despachada_at, (o.estado = 'cancelled') AS cancelada, $1::boolean AS con_despachos
       FROM ml_conversaciones c
       JOIN ml_conexiones x ON x.id = c.conexion_id
       -- Lo que sirve para responder "¿ya lo enviaste?": si su guía ya salió en Despachos (en
       -- ZOOM/TEALCA ML no lo sabe). Dato informativo: pudo despacharse sin registrarlo aquí.
       LEFT JOIN LATERAL (
         SELECT l.generated_at AS despachada_at FROM despacho_etiquetas e JOIN despacho_lotes l ON l.id = e.lote_id
         WHERE e.venta = c.pack_id::text AND e.impresa AND l.status = 'GENERADO' ORDER BY l.generated_at DESC LIMIT 1
       ) d ON TRUE
       LEFT JOIN LATERAL (
         SELECT estado FROM ml_ordenes WHERE id = c.pack_id OR pack_id = c.pack_id LIMIT 1
       ) o ON TRUE
       ${filtro}
       ORDER BY (c.sin_leer > 0) DESC, c.ultimo_at DESC NULLS LAST
       LIMIT 200`, [tieneModulo(s.session.user, 'despachos')])
    const { rows: [n] } = await s.db.query(
      `SELECT COUNT(*) FILTER (WHERE sin_leer > 0)::int AS conversaciones, COALESCE(SUM(sin_leer), 0)::int AS mensajes,
              COUNT(*) FILTER (WHERE notas IS NOT NULL)::int AS con_nota
       FROM ml_conversaciones`)
    // Respuestas rápidas (botones en cada conversación); `sugeridas` = ejemplos para el editor.
    const { rows: [pl] } = await s.db.query(`SELECT value FROM app_settings WHERE key = 'mensajes_plantillas'`)
    const { rows: [cta] } = await s.db.query(`SELECT nickname FROM ml_conexiones WHERE estado = 'activa' ORDER BY id LIMIT 1`)
    return NextResponse.json({
      conversaciones: rows, sin_leer: n, rapidas: leerMensajesRapidos(pl?.value), esAdmin: s.session.user.role === 'admin',
      sugeridas: MENSAJES_SUGERIDOS(cta?.nickname),
    })
  } catch (err) {
    return apiError(err)
  }
}
