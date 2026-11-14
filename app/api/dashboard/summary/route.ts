import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized } from '@/lib/session'
import { leerReglas } from '@/lib/stockReglas'

export async function GET(_: NextRequest) {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()

  try {
    // 12-11 (rapidez): las 9 cifras en UNA consulta (cada una es la misma de antes, como subconsulta). Antes eran
    // 9 pedidos que, sobre la misma conexión del request, iban en fila (0,8–3,7 s con el server ocupado).
    const { rows: [t] } = await db.query(`
      SELECT a1.n AS a1_n, a2.cnt AS a2_cnt, a2.total AS a2_total, a3.total AS a3_total, a3.commission AS a3_commission, a4.n AS a4_n, a5.n AS a5_n, a6.n AS a6_n, a7.n AS a7_n, a8.total AS a8_total, a8c.total AS a8c_total, a8c.commission AS a8c_commission
      FROM (SELECT COUNT(*) AS n FROM products WHERE is_active = TRUE) a1,
           (SELECT COUNT(*) AS cnt, COALESCE(SUM(total_amount), 0) AS total FROM sales WHERE status IN ('PROCESADA','DESCARGADA','DESCARGADA_LOCAL') AND DATE_TRUNC('month', COALESCE(processed_at, created_at)) = DATE_TRUNC('month', NOW())) a2,
           (SELECT COALESCE(SUM(si.quantity * COALESCE(si.unit_cost, 0)), 0) AS total, COALESCE(SUM(si.quantity * COALESCE(si.unit_commission, 0)), 0) AS commission FROM sale_items si JOIN sales s ON s.id = si.sale_id WHERE s.status IN ('PROCESADA','DESCARGADA','DESCARGADA_LOCAL') AND DATE_TRUNC('month', COALESCE(s.processed_at, s.created_at)) = DATE_TRUNC('month', NOW())) a3,
           (SELECT COUNT(*) AS n FROM inventory i JOIN products p ON i.product_id = p.id WHERE p.is_active = TRUE AND i.quantity <= i.min_stock AND i.min_stock > 0) a4,
           (SELECT COUNT(*) AS n FROM inventory i JOIN products p ON i.product_id = p.id WHERE p.is_active = TRUE AND i.quantity = 0) a5,
           (SELECT COUNT(*) AS n FROM sales WHERE status = 'BORRADOR') a6,
           (SELECT COUNT(*) AS n FROM purchase_orders WHERE status IN ('PAGADA','EN_CAMINO','PAGO_PARCIAL','EN_TRANSITO','ADUANA','EN_IMPORTADOR_PAGAR')) a7,
           (SELECT COALESCE(SUM(total_amount), 0) AS total FROM sales WHERE status IN ('PROCESADA','DESCARGADA','DESCARGADA_LOCAL') AND DATE_TRUNC('month', COALESCE(processed_at, created_at)) = DATE_TRUNC('month', NOW() - INTERVAL '1 month') AND COALESCE(processed_at, created_at) < NOW() - INTERVAL '1 month') a8,
           (SELECT COALESCE(SUM(si.quantity * COALESCE(si.unit_cost, 0)), 0) AS total, COALESCE(SUM(si.quantity * COALESCE(si.unit_commission, 0)), 0) AS commission FROM sale_items si JOIN sales s ON s.id = si.sale_id WHERE s.status IN ('PROCESADA','DESCARGADA','DESCARGADA_LOCAL') AND DATE_TRUNC('month', COALESCE(s.processed_at, s.created_at)) = DATE_TRUNC('month', NOW() - INTERVAL '1 month') AND COALESCE(s.processed_at, s.created_at) < NOW() - INTERVAL '1 month') a8c
    `)
    const a1 = { n: t.a1_n }, a2 = { cnt: t.a2_cnt, total: t.a2_total }, a3 = { total: t.a3_total, commission: t.a3_commission }
    const a4 = { n: t.a4_n }, a5 = { n: t.a5_n }, a6 = { n: t.a6_n }, a7 = { n: t.a7_n }, a8 = { total: t.a8_total }
    const a8c = { total: t.a8c_total, commission: t.a8c_commission }

    const salesAmount = parseFloat(a2.total ?? 0)
    const costsMonth  = parseFloat(a3.total ?? 0)
    const commMonth   = parseFloat(a3.commission ?? 0)   // comisión ML neteada (ganancia real)
    const profitMonth = salesAmount - costsMonth - commMonth
    const profitPct   = costsMonth > 0 ? (profitMonth / costsMonth) * 100 : 0

    // Sin rotación, reposición e importados por verificar en UNA consulta, con las ventas de 6 meses en una
    // sola pasada (12-11: antes 3 consultas seguidas y una subconsulta por producto, 0,3–0,4 s cada una).
    //   a9  sin rotación (parados): con stock y menos de N vendidas en M meses
    //   a10 reposición: lo que tiene alcanza para menos de lo que tarda en llegar
    // 14-11: con las reglas de la empresa (Reportes → Stock → Reglas). Es la cuenta rápida; el detalle (días con stock,
    // en camino, recién llegados) lo afina Reportes → Stock. Con las de SolucionesMC da lo mismo que antes (6/6/4).
    const { reglas: rg } = await leerReglas(db)
    const { rows: [r9] } = await db.query(`
      WITH v6 AS (
        SELECT si.product_id,
               SUM(si.quantity) FILTER (WHERE s.created_at >= NOW() - make_interval(months => $1)) AS q,
               SUM(si.quantity) FILTER (WHERE s.created_at >= NOW() - make_interval(months => $2)) AS qp
        FROM sales s JOIN sale_items si ON s.id = si.sale_id
        WHERE s.status IN ('PROCESADA','DESCARGADA','DESCARGADA_LOCAL')
          AND s.created_at >= NOW() - make_interval(months => GREATEST($1, $2))
        GROUP BY si.product_id
      ),
      t AS (
        SELECT COALESCE(i.quantity, 0) AS stock, i.id AS inv_id, COALESCE(v6.q, 0) AS ventas_h, COALESCE(v6.qp, 0) AS ventas_p, p.stock_por_verificar
        FROM products p
        LEFT JOIN inventory i ON i.product_id = p.id
        LEFT JOIN v6 ON v6.product_id = p.id
        WHERE p.is_active = TRUE
      )
      SELECT COUNT(*) FILTER (WHERE inv_id IS NOT NULL AND stock > 0 AND ventas_p < $3) AS a9,
             COUNT(*) FILTER (WHERE ventas_h > 0 AND NOT (ventas_p < $3 AND stock > 0)
                               AND ventas_h / $1::float >= $5 AND stock < (ventas_h / $1::float) * $4) AS a10,
             COUNT(*) FILTER (WHERE stock_por_verificar) AS a11
      FROM t
    `, [rg.historia, rg.paradoMeses, rg.paradoUnidades, rg.llegada, rg.minimo])
    const a9 = { n: r9.a9 }, a10 = { n: r9.a10 }, a11 = { n: r9.a11 }

    return NextResponse.json({
      por_verificar:           parseInt(a11.n, 10),
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
        Math.round((parseFloat(a8.total ?? 0) - parseFloat(a8c.total ?? 0) - parseFloat(a8c.commission ?? 0)) * 100) / 100,
    })
  } catch (err) {
    return apiError(err)
  }
}
