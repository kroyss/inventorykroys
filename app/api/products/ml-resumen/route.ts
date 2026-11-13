import { NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized, forbidden } from '@/lib/session'
import { puede } from '@/lib/permisos'
import { tieneModulo } from '@/lib/modulos'

// GET /api/products/ml-resumen (13-11-2026, el dueño, mig. 173) → lo que usan la sugerencia de Inicio («Empieza tu
// inventario desde MercadoLibre») y el aviso de Productos («N publicaciones nuevas sin producto»):
//   conectada: hay alguna cuenta de ML activa · productos / vinculados: productos activos y cuántos tienen código de ML
//   nuevas: publicaciones aparecidas en los últimos 15 días sin ningún producto (ni marcadas «No se usa»).
export async function GET() {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  if (!tieneModulo(session.user, 'inventario') || !(puede(session.user, 'ver_productos') || puede(session.user, 'vincular_ml'))) return forbidden()
  try {
    const { rows: [r] } = await db.query(`
      SELECT EXISTS (SELECT 1 FROM ml_conexiones WHERE estado = 'activa') AS conectada,
             (SELECT COUNT(*)::int FROM products WHERE is_active) AS productos,
             (SELECT COUNT(DISTINCT m.product_id)::int FROM product_ml_codes m JOIN products p ON p.id = m.product_id
              WHERE m.is_active AND p.is_active) AS vinculados,
             (SELECT COUNT(*)::int FROM ml_catalogo c
              WHERE c.visto_at > NOW() - INTERVAL '15 days'
                AND NOT EXISTS (SELECT 1 FROM product_ml_codes m WHERE m.is_active
                                  AND split_part(m.ml_code, ':', 1) = regexp_replace(c.item_id, '^[A-Z]{3}', ''))
                AND NOT EXISTS (SELECT 1 FROM ml_variantes_descartadas x WHERE x.motivo = 'no_usa'
                                  AND split_part(x.codigo, ':', 1) = regexp_replace(c.item_id, '^[A-Z]{3}', ''))) AS nuevas`)
    return NextResponse.json(r)
  } catch (err) {
    return apiError(err)
  }
}
