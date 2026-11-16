import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { sesionPreguntas } from '@/lib/preguntasSesion'
import { puede } from '@/lib/permisos'
import { tieneModulo } from '@/lib/modulos'

// GET /api/stock-en-ml/historial?product_id=&usuario_id= (16-11, el dueño: seguimiento de lo que hace bodega)
//   Los últimos 200 cambios de stock/estado hechos en ML desde el sistema (ml_stock_cambios, mig 111/181), con el
//   producto vinculado. Quien configura el inventario ve los de todos; los demás, solo los suyos.
export async function GET(req: NextRequest) {
  const s = await sesionPreguntas()
  if ('error' in s) return s.error
  const u = s.session.user
  if (!tieneModulo(u, 'inventario') || !puede(u, 'ver_inventario')) {
    return NextResponse.json({ error: 'No tienes acceso al inventario' }, { status: 403 })
  }
  const todos = puede(u, 'inventario_config')
  const q = req.nextUrl.searchParams
  const producto = Number(q.get('product_id')) || null
  const usuario = todos ? Number(q.get('usuario_id')) || null : Number(u.id)
  try {
    const [{ rows }, personas] = await Promise.all([
      s.db.query(
        `SELECT h.id::text, h.creado_at, h.item_id, NULLIF(h.variante_id, 0)::text AS variante_id, h.antes, h.despues,
                h.estado_antes, h.estado_despues, h.reactivada, h.origen, h.error, h.motivo,
                us.full_name AS usuario, x.nickname AS cuenta, c.titulo, pr.id AS product_id, pr.code, pr.name
         FROM ml_stock_cambios h
         LEFT JOIN users us ON us.id = h.usuario_id
         LEFT JOIN ml_conexiones x ON x.id = h.conexion_id
         LEFT JOIN ml_catalogo c ON c.item_id = h.item_id
         LEFT JOIN LATERAL (
           SELECT p.id, p.code, p.name FROM product_ml_codes m JOIN products p ON p.id = m.product_id
           WHERE m.is_active AND split_part(m.ml_code, ':', 1) = substring(h.item_id FROM 4)
             AND (h.variante_id = 0 OR split_part(m.ml_code, ':', 2) IN ('', h.variante_id::text))
           ORDER BY (split_part(m.ml_code, ':', 2) = h.variante_id::text) DESC LIMIT 1) pr ON TRUE
         WHERE ($1::int IS NULL OR pr.id = $1) AND ($2::int IS NULL OR h.usuario_id = $2)
         ORDER BY h.creado_at DESC LIMIT 200`, [producto, usuario]),
      todos ? s.db.query(
        `SELECT DISTINCT h.usuario_id AS id, us.full_name AS nombre FROM ml_stock_cambios h JOIN users us ON us.id = h.usuario_id
         WHERE h.creado_at > NOW() - INTERVAL '90 days' ORDER BY 2`).then(r => r.rows) : Promise.resolve([]),
    ])
    return NextResponse.json({ filas: rows, personas, todos })
  } catch (err) {
    return apiError(err)
  }
}
