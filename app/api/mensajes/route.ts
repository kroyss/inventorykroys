import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { sesionPreguntas } from '@/lib/preguntasSesion'

// GET /api/mensajes?vista=sin_leer|todas → conversaciones post-venta de las cuentas de la
// empresa (las sin leer primero) con el estado de la venta en el sistema.
export async function GET(req: NextRequest) {
  const s = await sesionPreguntas()
  if ('error' in s) return s.error
  const todas = new URL(req.url).searchParams.get('vista') === 'todas'
  try {
    const { rows } = await s.db.query(
      `SELECT c.pack_id::text, c.sin_leer, c.ultimo_texto, c.ultimo_de_comprador, c.ultimo_at, c.productos,
              x.nickname AS cuenta, v.status AS venta_estado
       FROM ml_conversaciones c
       JOIN ml_conexiones x ON x.id = c.conexion_id
       LEFT JOIN sales v ON v.ml_order_number = c.pack_id::text
       ${todas ? '' : 'WHERE c.sin_leer > 0'}
       ORDER BY (c.sin_leer > 0) DESC, c.ultimo_at DESC NULLS LAST
       LIMIT 200`)
    const { rows: [n] } = await s.db.query(
      `SELECT COUNT(*) FILTER (WHERE sin_leer > 0)::int AS conversaciones, COALESCE(SUM(sin_leer), 0)::int AS mensajes
       FROM ml_conversaciones`)
    return NextResponse.json({ conversaciones: rows, sin_leer: n })
  } catch (err) {
    return apiError(err)
  }
}
