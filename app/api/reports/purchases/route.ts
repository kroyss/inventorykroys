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
    const { rows: orders } = await db.query(`
      SELECT
        po.id, po.order_number, po.order_type, po.status,
        po.total_usd, po.total_paid, po.created_at,
        s.name AS supplier_name,
        COALESCE(
          JSON_AGG(
            JSON_BUILD_OBJECT(
              'code',     p.code,
              'name',     p.name,
              'quantity', poi.quantity,
              'unit_price', poi.unit_cost_usd,
              'received', COALESCE(poi.total_received_qty, poi.received_qty, 0)
            ) ORDER BY p.name
          ) FILTER (WHERE poi.id IS NOT NULL),
          '[]'::json
        ) AS items
      FROM purchase_orders po
      LEFT JOIN suppliers s ON po.supplier_id = s.id
      LEFT JOIN purchase_order_items poi ON poi.purchase_order_id = po.id
      LEFT JOIN products p ON p.id = poi.product_id
      WHERE DATE(po.created_at) BETWEEN $1 AND $2
      GROUP BY po.id, s.name
      ORDER BY po.created_at DESC
    `, [dateFrom, dateTo])

    let totalUsd  = 0
    let totalPaid = 0
    for (const o of orders) {
      totalUsd  += parseFloat(o.total_usd)  || 0
      totalPaid += parseFloat(o.total_paid) || 0
    }

    return NextResponse.json({
      purchases: orders.map(o => ({
        ...o,
        total_usd:     parseFloat(o.total_usd)  || 0,
        total_paid:    parseFloat(o.total_paid) || 0,
        supplier_name: o.supplier_name ?? 'Sin proveedor',
      })),
      totals: {
        total_usd:  Math.round(totalUsd  * 100) / 100,
        total_paid: Math.round(totalPaid * 100) / 100,
        count:      orders.length,
      },
    })
  } catch (err) {
    return apiError(err)
  }
}
