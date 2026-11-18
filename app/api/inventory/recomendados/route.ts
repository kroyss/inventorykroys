import { NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized, forbidden } from '@/lib/session'
import { puede } from '@/lib/permisos'
import { leerReglas } from '@/lib/stockReglas'
import { nivelStockSQL } from '@/lib/nivelStock'

// Llena de una vez el stock mínimo / máximo que NO está configurado (0) con el recomendado
// por ventas de los últimos 6 meses — la misma fórmula que muestra Inventario:
//   mín = ventas_6m / 6 × 4   (4 meses)      máx = ventas_6m / 6 × 12   (12 meses)
// No pisa lo que ya tiene un valor. Solo productos activos y con ventas (recomendado > 0).
// Una sola sentencia UPDATE: es atómica sin abrir transacción.
export async function POST() {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  if (!puede(session.user, 'inventario_config')) return forbidden()

  try {
    const { reglas } = await leerReglas(db)
    const { rows: [r] } = await db.query(`
      WITH rec AS (
        -- Fase 2 (18-11): los mismos recomendados que muestra Inventario (reglas de Reponer, lib/nivelStock.ts).
        SELECT inv.product_id, ns.min_rec, ns.max_rec
        FROM inventory inv
        JOIN products p ON p.id = inv.product_id AND p.is_active
        JOIN ${nivelStockSQL(reglas)} ns ON ns.product_id = inv.product_id
      ), upd AS (
        UPDATE inventory i
        -- sin cruzarse con lo que ya estaba configurado (mín nunca por encima del máx)
        SET min_stock    = CASE WHEN i.min_stock > 0 THEN i.min_stock
                                WHEN i.max_stock > 0 THEN LEAST(rec.min_rec, i.max_stock)
                                ELSE rec.min_rec END,
            max_stock    = CASE WHEN i.max_stock > 0 THEN i.max_stock
                                ELSE GREATEST(rec.max_rec, i.min_stock) END,
            last_updated = NOW()
        FROM rec
        WHERE rec.product_id = i.product_id
          AND ((i.min_stock = 0 AND rec.min_rec > 0) OR (i.max_stock = 0 AND rec.max_rec > 0))
        RETURNING i.product_id
      )
      SELECT COUNT(*)::int AS productos FROM upd
    `)
    return NextResponse.json({ productos: r.productos })
  } catch (err) {
    return apiError(err)
  }
}
