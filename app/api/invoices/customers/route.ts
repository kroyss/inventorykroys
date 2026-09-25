import { NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized, forbidden } from '@/lib/session'

// GET /api/invoices/customers → clientes ya facturados con RIF/CI (autocompletado del form).
export async function GET() {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  if (session.user.country !== 'VE') return forbidden()

  try {
    const { rows } = await db.query(`
      SELECT id, doc_id, name, address, phone, is_special, retention_percent::float AS retention_percent
      FROM invoice_customers
      ORDER BY updated_at DESC
      LIMIT 1000
    `)
    return NextResponse.json(rows)
  } catch (err) {
    return apiError(err)
  }
}
