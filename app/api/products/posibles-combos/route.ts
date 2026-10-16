import { NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized, forbidden } from '@/lib/session'
import { puede } from '@/lib/permisos'
import { unidadesDelTitulo } from '@/lib/combos'

/** GET /api/products/posibles-combos → publicaciones vinculadas en 1 unidad cuyo título dice que son combo
 *  ("Combo 4", "x6"…), para revisarlas de una vez (migración 098). */
export async function GET() {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  if (!puede(session.user, 'ver_productos')) return forbidden()
  try {
    const { rows } = await db.query(
      `SELECT m.id, m.product_id, p.code, p.name, m.ml_account AS cuenta, m.ml_code AS codigo, COALESCE(c.titulo, m.titulo) AS titulo
       FROM product_ml_codes m JOIN products p ON p.id = m.product_id AND p.is_active
       LEFT JOIN LATERAL (SELECT titulo FROM ml_catalogo WHERE item_id IN ('MLV' || split_part(m.ml_code, ':', 1), 'MCO' || split_part(m.ml_code, ':', 1)) LIMIT 1) c ON TRUE
       WHERE m.is_active AND m.unidades = 1 AND NOT m.combo_revisado AND COALESCE(c.titulo, m.titulo) IS NOT NULL`)
    const posibles = rows.map(r => ({ ...r, sugeridas: unidadesDelTitulo(r.titulo) })).filter(r => r.sugeridas)
    return NextResponse.json({ posibles })
  } catch (err) {
    return apiError(err)
  }
}
