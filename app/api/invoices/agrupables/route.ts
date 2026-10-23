import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized, forbidden } from '@/lib/session'
import { facturasHabilitadas } from '@/lib/modulos'
import { sqlFacturaIncluye } from '@/lib/invoicesServer'

// GET /api/invoices/agrupables?venta=ID&q=texto → ventas para facturar en la MISMA hoja que la venta ID (mig 114).
// Sin q: las del mismo comprador de los últimos 30 días. Con q: por nº de orden, comprador o producto (nombre o
// código), últimos 90 días; sirve también para juntar productos de compradores distintos. Nunca salen las que ya
// están en una factura EMITIDA (como principal o agrupadas): así no se factura dos veces.
export async function GET(req: NextRequest) {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  if (!facturasHabilitadas(session.user)) return forbidden()
  try {
    const venta = req.nextUrl.searchParams.get('venta') ?? ''
    if (!/^\d+$/.test(venta)) return NextResponse.json({ error: 'Falta la venta' }, { status: 400 })
    const q = (req.nextUrl.searchParams.get('q') ?? '').trim().slice(0, 80)
    const { rows } = await db.query(`
      SELECT s.id, s.ml_order_number, s.customer_name, s.created_at, s.discount_percent::float AS discount_percent,
             s.total_amount::float AS total_amount,
             COALESCE((SELECT JSON_AGG(JSON_BUILD_OBJECT(
                 'product_id', si.product_id, 'product_name', p.name, 'product_code', p.code,
                 'quantity', si.quantity::float, 'unit_price', si.unit_price::float) ORDER BY si.id)
               FROM sale_items si JOIN products p ON p.id = si.product_id WHERE si.sale_id = s.id), '[]'::json) AS items
      FROM sales s
      WHERE s.id <> $1
        AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.status = 'EMITIDA' AND ${sqlFacturaIncluye('i', 's.id')})
        AND ${q
          ? `s.created_at > NOW() - INTERVAL '90 days' AND (
               s.ml_order_number ILIKE '%' || $2 || '%' OR s.customer_name ILIKE '%' || $2 || '%'
               OR EXISTS (SELECT 1 FROM sale_items si JOIN products p ON p.id = si.product_id
                          WHERE si.sale_id = s.id AND (p.name ILIKE '%' || $2 || '%' OR p.code ILIKE '%' || $2 || '%')))`
          : `s.created_at > NOW() - INTERVAL '30 days'
             AND lower(s.customer_name) = (SELECT lower(customer_name) FROM sales WHERE id = $1)`}
      ORDER BY s.created_at DESC
      LIMIT 20`, q ? [venta, q] : [venta])
    return NextResponse.json(rows)
  } catch (err) {
    return apiError(err)
  }
}
