import { NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized, forbidden } from '@/lib/session'

// Reporte de conteos físicos.
//
// Un "conteo" es un lote de ajustes que comparten `reference` (CONTEO-2026-08).
// Solo aparecen los productos que dieron diferencia: si el conteo coincidió no
// se genera movimiento, y esa ausencia ya es la señal de que el producto va bien.
//
// `veces` cuenta en cuántos conteos distintos falló cada producto: dos conteos
// seguidos con diferencia dejan de ser error de conteo y son problema de proceso.
export async function GET() {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  if (session.user.role !== 'admin') return forbidden()

  try {
    const { rows } = await db.query(`
      WITH ajustes AS (
        SELECT m.reference, m.product_id, m.quantity AS delta, m.notes, m.created_at
        FROM inventory_movements m
        WHERE m.movement_type = 'ADJUST'
          AND m.reference LIKE 'CONTEO%'
      ),
      veces AS (
        SELECT product_id, COUNT(DISTINCT reference)::int AS veces
        FROM ajustes GROUP BY product_id
      )
      SELECT
        a.reference,
        p.code,
        p.name,
        a.delta::int                        AS delta,
        a.notes,
        COALESCE(i.quantity, 0)::int        AS stock_actual,
        v.veces,
        to_char(a.created_at, 'YYYY-MM-DD') AS fecha
      FROM ajustes a
      JOIN products  p ON p.id = a.product_id
      JOIN veces     v ON v.product_id = a.product_id
      LEFT JOIN inventory i ON i.product_id = a.product_id
      ORDER BY a.reference DESC, ABS(a.delta) DESC, p.name
    `)

    // Resumen por conteo, para el selector: cuántos productos y cuántas unidades
    // se perdieron/aparecieron en cada uno.
    const conteos = new Map<string, { reference: string; fecha: string; productos: number; faltantes: number; sobrantes: number }>()
    for (const r of rows) {
      const c = conteos.get(r.reference) ?? { reference: r.reference, fecha: r.fecha, productos: 0, faltantes: 0, sobrantes: 0 }
      c.productos += 1
      if (r.delta < 0) c.faltantes += -r.delta
      else             c.sobrantes += r.delta
      conteos.set(r.reference, c)
    }

    return NextResponse.json({ items: rows, conteos: [...conteos.values()] })
  } catch (err) {
    return apiError(err)
  }
}
