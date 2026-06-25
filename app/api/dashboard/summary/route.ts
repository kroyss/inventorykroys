import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized } from '@/lib/session'

export async function GET(_: NextRequest) {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()

  try {
    const [
      { rows: [a1] },
      { rows: [a2] },
      { rows: [a3] },
      { rows: [a4] },
      { rows: [a5] },
      { rows: [a6] },
      { rows: [a7] },
      { rows: [a8] },
      { rows: [a8c] },
    ] = await Promise.all([
      db.query(`SELECT COUNT(*) AS n FROM products WHERE is_active = TRUE`),
      db.query(`
        SELECT COUNT(*) AS cnt, COALESCE(SUM(total_amount), 0) AS total
        FROM sales
        WHERE status IN ('PROCESADA','DESCARGADA','DESCARGADA_LOCAL')
          AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())
      `),
      db.query(`
        SELECT COALESCE(SUM(si.quantity * COALESCE(si.unit_cost, 0)), 0) AS total
        FROM sale_items si
        JOIN sales s ON s.id = si.sale_id
        WHERE s.status IN ('PROCESADA','DESCARGADA','DESCARGADA_LOCAL')
          AND DATE_TRUNC('month', s.created_at) = DATE_TRUNC('month', NOW())
      `),
      db.query(`
        SELECT COUNT(*) AS n FROM inventory i
        JOIN products p ON i.product_id = p.id
        WHERE p.is_active = TRUE AND i.quantity <= i.min_stock AND i.min_stock > 0
      `),
      db.query(`
        SELECT COUNT(*) AS n FROM inventory i
        JOIN products p ON i.product_id = p.id
        WHERE p.is_active = TRUE AND i.quantity = 0
      `),
      db.query(`SELECT COUNT(*) AS n FROM sales WHERE status = 'BORRADOR'`),
      db.query(`
        SELECT COUNT(*) AS n FROM purchase_orders
        WHERE status IN ('PAGADA','EN_CAMINO','PAGO_PARCIAL','EN_TRANSITO','ADUANA','EN_IMPORTADOR_PAGAR')
      `),
      db.query(`
        -- Mes anterior pero solo hasta el mismo día/hora transcurridos del mes actual
        -- (p.ej. hoy 8 jun → compara contra 1–8 may, no contra mayo completo),
        -- para que sea una comparación justa de días calendario equivalentes.
        SELECT COALESCE(SUM(total_amount), 0) AS total
        FROM sales
        WHERE status IN ('PROCESADA','DESCARGADA','DESCARGADA_LOCAL')
          AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW() - INTERVAL '1 month')
          AND created_at < NOW() - INTERVAL '1 month'
      `),
      db.query(`
        -- Costos del mes anterior, mismo tramo de días (para ganancia comparable)
        SELECT COALESCE(SUM(si.quantity * COALESCE(si.unit_cost, 0)), 0) AS total
        FROM sale_items si
        JOIN sales s ON s.id = si.sale_id
        WHERE s.status IN ('PROCESADA','DESCARGADA','DESCARGADA_LOCAL')
          AND DATE_TRUNC('month', s.created_at) = DATE_TRUNC('month', NOW() - INTERVAL '1 month')
          AND s.created_at < NOW() - INTERVAL '1 month'
      `),
    ])

    const salesAmount = parseFloat(a2.total ?? 0)
    const costsMonth  = parseFloat(a3.total ?? 0)
    const profitMonth = salesAmount - costsMonth
    const profitPct   = costsMonth > 0 ? (profitMonth / costsMonth) * 100 : 0

    const { rows: [a9] } = await db.query(`
      SELECT COUNT(DISTINCT p.id) AS n
      FROM products p
      JOIN inventory i ON p.id = i.product_id
      WHERE p.is_active = TRUE AND i.quantity > 0
        AND (
          SELECT COALESCE(SUM(si.quantity), 0)
          FROM sale_items si
          JOIN sales s ON si.sale_id = s.id
          WHERE si.product_id = p.id
            AND s.status IN ('PROCESADA','DESCARGADA','DESCARGADA_LOCAL')
            AND s.created_at >= NOW() - INTERVAL '6 months'
        ) < 6
    `)

    // Reposición: productos que necesitan recompra (< 4 meses de stock según venta mensual)
    const { rows: [a10] } = await db.query(`
      SELECT COUNT(*) AS n FROM (
        SELECT
          COALESCE(i.quantity, 0) AS stock,
          COALESCE((
            SELECT SUM(si.quantity)
            FROM sale_items si JOIN sales s ON si.sale_id = s.id
            WHERE si.product_id = p.id
              AND s.status IN ('PROCESADA','DESCARGADA','DESCARGADA_LOCAL')
              AND s.created_at >= NOW() - INTERVAL '6 months'
          ), 0) AS ventas_6m
        FROM products p
        LEFT JOIN inventory i ON i.product_id = p.id
        WHERE p.is_active = TRUE
      ) t
      WHERE ventas_6m > 0
        AND NOT (ventas_6m < 6 AND stock > 0)
        AND stock < (ventas_6m / 6.0) * 4
    `)

    return NextResponse.json({
      active_products:         parseInt(a1.n, 10),
      sales_count_month:       parseInt(a2.cnt, 10),
      sales_amount_month:      Math.round(salesAmount * 100) / 100,
      costs_month:             Math.round(costsMonth * 100) / 100,
      profit_month:            Math.round(profitMonth * 100) / 100,
      profit_pct:              Math.round(profitPct * 10) / 10,
      low_stock_alerts:        parseInt(a4.n, 10),
      no_stock:                parseInt(a5.n, 10),
      pending_sales:           parseInt(a6.n, 10),
      in_transit:              parseInt(a7.n, 10),
      remate_count:            parseInt(a9.n, 10),
      reposicion_count:        parseInt(a10.n, 10),
      last_month_sales_amount: Math.round(parseFloat(a8.total ?? 0) * 100) / 100,
      last_month_profit_amount:
        Math.round((parseFloat(a8.total ?? 0) - parseFloat(a8c.total ?? 0)) * 100) / 100,
    })
  } catch (err) {
    return apiError(err)
  }
}
