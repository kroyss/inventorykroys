import { NextRequest, NextResponse } from 'next/server'
import { getFinanceSession } from '@/lib/finance'
import { unauthorized, forbidden } from '@/lib/session'

export async function GET(_: NextRequest) {
  const { session, db } = await getFinanceSession()
  if (!session || !db) return unauthorized()
  if (session.user.role !== 'admin') return forbidden()

  const { rows } = await db.query(`
    SELECT id, name, kind, is_active, display_order
    FROM finance_categories
    WHERE is_active = TRUE
    ORDER BY kind, display_order, name
  `)
  return NextResponse.json(rows)
}
