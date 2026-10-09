import { NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized, forbidden } from '@/lib/session'
import { facturasHabilitadas } from '@/lib/modulos'

// GET /api/invoices/drafts → facturas a medio llenar (se autoguardan): si se fue la luz o se cerró la
// ventana, en Facturas se ve qué quedó pendiente y se retoma.
export async function GET() {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  if (!facturasHabilitadas(session.user)) return forbidden()
  try {
    const { rows } = await db.query(`
      SELECT d.sale_id, s.ml_order_number, COALESCE(NULLIF(d.data->>'name', ''), s.customer_name) AS cliente,
             d.updated_at, u.username AS updated_by
      FROM invoice_drafts d
      JOIN sales s ON s.id = d.sale_id
      LEFT JOIN users u ON u.id = d.updated_by
      WHERE NOT EXISTS (SELECT 1 FROM invoices i WHERE i.sale_id = d.sale_id AND i.status = 'EMITIDA')
      ORDER BY d.updated_at DESC
      LIMIT 50
    `)
    return NextResponse.json(rows)
  } catch (err) {
    return apiError(err)
  }
}
