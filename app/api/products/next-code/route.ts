import { NextResponse } from 'next/server'
import { getSessionDb, unauthorized } from '@/lib/session'

export async function GET() {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()

  const { rows } = await db.query(
    `SELECT code FROM products
     WHERE code ~ '^COD-[0-9]+$'
     ORDER BY CAST(SUBSTRING(code FROM 5) AS INTEGER) DESC
     LIMIT 1`
  )
  const last = rows[0]?.code
  const next = last
    ? `COD-${String(Number(last.replace('COD-', '')) + 1).padStart(4, '0')}`
    : 'COD-0001'
  return NextResponse.json({ next_code: next })
}
