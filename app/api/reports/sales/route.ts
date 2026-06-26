import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized, forbidden } from '@/lib/session'

export async function GET(req: NextRequest) {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  if (session.user.role !== 'admin') return forbidden()

  const url      = new URL(req.url)
  const dateFrom = url.searchParams.get('date_from')
  const dateTo   = url.searchParams.get('date_to')

  if (!dateFrom || !dateTo) {
    return NextResponse.json({ error: 'Parámetros date_from y date_to requeridos' }, { status: 400 })
  }

  try {
    const { rows } = await db.query(`
      SELECT
        s.id, s.ml_order_number, s.customer_name,
        s.total_amount, s.discount_percent, s.status,
        s.created_at, s.notes,
        u.username AS created_by,
        COALESCE(
          JSON_AGG(
            JSON_BUILD_OBJECT(
              'product_name', p.name,
              'product_code', p.code,
              'quantity',     si.quantity,
              'unit_price',   si.unit_price,
              'total_price',  si.total_price,
              'total_cost',   COALESCE(si.unit_cost, 0) + COALESCE(si.unit_commission, 0)
            ) ORDER BY si.id
          ) FILTER (WHERE si.id IS NOT NULL),
          '[]'::json
        ) AS items
      FROM sales s
      LEFT JOIN users u     ON s.created_by = u.id
      LEFT JOIN sale_items si ON si.sale_id = s.id
      LEFT JOIN products p    ON p.id = si.product_id
      WHERE s.status IN ('PROCESADA','DESCARGADA','DESCARGADA_LOCAL')
        AND DATE(s.created_at) BETWEEN $1 AND $2
      GROUP BY s.id, u.username
      ORDER BY s.created_at DESC
    `, [dateFrom, dateTo])

    let totalAmount = 0
    let totalCost   = 0

    const sales = rows.map(row => {
      const amount = parseFloat(row.total_amount) || 0
      const cost   = (row.items as any[]).reduce(
        (s: number, i: any) => s + (i.quantity * parseFloat(i.total_cost || 0)), 0
      )
      totalAmount += amount
      totalCost   += cost
      return { ...row, total_amount: amount, cost: Math.round(cost * 100) / 100 }
    })

    const profit = totalAmount - totalCost
    return NextResponse.json({
      sales,
      totals: {
        total_amount: Math.round(totalAmount * 100) / 100,
        total_cost:   Math.round(totalCost * 100) / 100,
        profit:       Math.round(profit * 100) / 100,
        profit_pct:   totalCost > 0 ? Math.round((profit / totalCost) * 1000) / 10 : 0,
        count:        sales.length,
      },
    })
  } catch (err) {
    return apiError(err)
  }
}
