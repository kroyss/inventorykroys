import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized, forbidden } from '@/lib/session'

export async function GET(_: NextRequest) {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  if (session.user.role !== 'admin') return forbidden()

  try {
    const [{ rows: locals }, { rows: imports }] = await Promise.all([
      db.query(`
        SELECT
          po.id, po.order_number, 'local' AS tipo, po.status,
          po.total_usd, po.created_at, s.name AS supplier_name,
          COALESCE(
            JSON_AGG(
              JSON_BUILD_OBJECT(
                'code',     p.code,
                'name',     p.name,
                'quantity', poi.quantity,
                'received', COALESCE(poi.received_qty, 0),
                'pending',  poi.quantity - COALESCE(poi.received_qty, 0)
              ) ORDER BY p.name
            ) FILTER (WHERE poi.id IS NOT NULL),
            '[]'::json
          ) AS items
        FROM purchase_orders po
        LEFT JOIN suppliers s ON po.supplier_id = s.id
        LEFT JOIN purchase_order_items poi ON poi.purchase_order_id = po.id
        LEFT JOIN products p ON p.id = poi.product_id
        WHERE po.status IN ('PENDIENTE','PAGADA','EN_CAMINO','PARCIAL','RECIBIDA')
        GROUP BY po.id, s.name
        ORDER BY po.status, po.created_at DESC
      `),
      db.query(`
        SELECT
          io.id, io.order_number, 'import' AS tipo, io.status,
          io.total_usd, io.created_at, s.name AS supplier_name,
          COALESCE(
            JSON_AGG(
              JSON_BUILD_OBJECT(
                'code',     p.code,
                'name',     p.name,
                'quantity', ioi.quantity,
                'received', COALESCE(ioi.received_qty, 0),
                'pending',  ioi.quantity - COALESCE(ioi.received_qty, 0)
              ) ORDER BY p.name
            ) FILTER (WHERE ioi.id IS NOT NULL),
            '[]'::json
          ) AS items
        FROM import_orders io
        LEFT JOIN suppliers s ON io.supplier_id = s.id
        LEFT JOIN import_order_items ioi ON ioi.import_order_id = io.id
        LEFT JOIN products p ON p.id = ioi.product_id
        WHERE io.status IN (
          'PENDIENTE','PAGO_PARCIAL','ESPERANDO_FOTOS','PAGADA',
          'EN_TRANSITO','ADUANA','EN_IMPORTADOR_PAGAR','EN_CAMINO','PARCIAL','RECIBIDA'
        )
        GROUP BY io.id, s.name
        ORDER BY io.status, io.created_at DESC
      `),
    ])

    const result = [...locals, ...imports].map(r => ({
      order_number:  r.order_number,
      tipo:          r.tipo,
      status:        r.status,
      supplier_name: r.supplier_name ?? 'Sin proveedor',
      total_usd:     parseFloat(r.total_usd) || 0,
      created_at:    r.created_at,
      items:         r.items,
    }))

    return NextResponse.json(result)
  } catch (err) {
    return apiError(err)
  }
}
