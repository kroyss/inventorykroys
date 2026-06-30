import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized, forbidden } from '@/lib/session'

const ORDER_MAP: Record<string, string> = {
  qty:      'total_qty DESC',
  ganancia: 'ganancia DESC',
  margen:   '(CASE WHEN SUM(si.total_price) > 0 THEN (SUM(si.total_price) - SUM(si.quantity * COALESCE(si.unit_cost, 0)) - SUM(si.quantity * COALESCE(si.unit_commission, 0))) / SUM(si.total_price) ELSE 0 END) DESC',
}

export async function GET(req: NextRequest) {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  if (session.user.role !== 'admin') return forbidden()

  const url      = new URL(req.url)
  const dateFrom = url.searchParams.get('date_from')
  const dateTo   = url.searchParams.get('date_to')
  const top      = parseInt(url.searchParams.get('top') ?? '10', 10)
  const category = url.searchParams.get('category') ?? null
  const orderBy  = url.searchParams.get('order_by') ?? 'qty'

  if (!dateFrom || !dateTo) {
    return NextResponse.json({ error: 'Parámetros date_from y date_to requeridos' }, { status: 400 })
  }

  const orderClause = ORDER_MAP[orderBy] ?? ORDER_MAP.qty
  const catFilter   = category ? `AND pc.name = $3` : ''
  const params: (string | number)[] = [dateFrom, dateTo]
  if (category) params.push(category)
  params.push(top)

  try {
    const { rows } = await db.query(`
      SELECT
        p.code, p.name,
        pc.name AS category_name,
        SUM(si.quantity)                                                AS total_qty,
        SUM(si.total_price)                                             AS total_venta,
        SUM(si.quantity * COALESCE(si.unit_cost, 0))                  AS total_costo,
        SUM(si.quantity * COALESCE(si.unit_commission, 0))           AS total_comision,
        SUM(si.total_price) - SUM(si.quantity * COALESCE(si.unit_cost, 0)) - SUM(si.quantity * COALESCE(si.unit_commission, 0)) AS ganancia
      FROM sale_items si
      JOIN products p     ON p.id = si.product_id
      JOIN sales s        ON s.id = si.sale_id
      LEFT JOIN product_pricing pp  ON pp.product_id = p.id
      LEFT JOIN profit_categories pc ON pc.id = pp.profit_category_id
      WHERE s.status IN ('PROCESADA','DESCARGADA','DESCARGADA_LOCAL')
        AND DATE(s.created_at) BETWEEN $1 AND $2
        AND p.is_active = TRUE
        ${catFilter}
      GROUP BY p.id, p.code, p.name, pc.name
      ORDER BY ${orderClause}
      LIMIT $${params.length}
    `, params)

    return NextResponse.json(rows.map(r => ({
      code:        r.code,
      name:        r.name,
      category:    r.category_name ?? 'Sin categoría',
      total_qty:   parseInt(r.total_qty, 10),
      total_venta: Math.round(parseFloat(r.total_venta) * 100) / 100,
      total_costo: Math.round(parseFloat(r.total_costo) * 100) / 100,
      ganancia:    Math.round(parseFloat(r.ganancia) * 100) / 100,
    })))
  } catch (err) {
    return apiError(err)
  }
}
