import { NextRequest, NextResponse } from 'next/server'
import { getSessionDb, unauthorized } from '@/lib/session'

export async function GET(
  _: NextRequest,
  { params }: { params: Promise<{ productId: string }> }
) {
  const { productId } = await params
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()

  const { rows } = await db.query(`
    WITH all_movements AS (
      SELECT
        im.id,
        im.movement_type,
        im.quantity,
        im.reference,
        im.notes,
        im.created_at,
        COALESCE(u.username, 'Sistema') AS username,
        -- Stock que quedó DESPUÉS de cada movimiento, calculado hacia atrás desde
        -- el stock real de hoy: stock_actual − (todo lo que se movió después).
        --
        -- Antes era la suma acumulada desde el primer movimiento, asumiendo que el
        -- producto arrancó en 0. Cualquier desfase viejo en el historial (stock
        -- cargado sin movimiento, un movimiento que no coincidía con lo que cambió)
        -- arrastraba un error constante: el panel decía 91 con 7 en góndola.
        -- Anclado a hoy, la última fila siempre coincide con el stock real; si el
        -- historial tiene un desfase, aparece en las filas VIEJAS como stock
        -- negativo, que es donde realmente está el problema.
        -- (quantity viene con signo: IN +, OUT −, ADJUST = delta.)
        COALESCE((SELECT quantity FROM inventory WHERE product_id = $1), 0)
          - COALESCE(SUM(im.quantity) OVER (
              ORDER BY im.id DESC
              ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
            ), 0) AS running_total
      FROM inventory_movements im
      LEFT JOIN users u ON im.created_by = u.id
      WHERE im.product_id = $1
    )
    SELECT * FROM all_movements ORDER BY id DESC
  `, [productId])
  return NextResponse.json(rows)
}
