import { NextRequest, NextResponse } from 'next/server'
import { getSessionDb, unauthorized } from '@/lib/session'

export async function GET(_: NextRequest) {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()

  const { rows } = await db.query(`
    SELECT id, name, contact, phone, email, notes
    FROM suppliers
    WHERE is_active = TRUE AND supplier_type = 'import'
    ORDER BY name
  `)
  return NextResponse.json(rows)
}
