import { NextResponse } from 'next/server'
import { getSessionDb, unauthorized } from '@/lib/session'
import type { Country } from '@/lib/types'

// In-memory cache per country. Profit categories change ~1x/year.
// TTL of 1h is enough for invalidation after any manual DB edit.
type CacheEntry = { data: unknown; expiresAt: number }
const cache: Record<Country, CacheEntry | undefined> = { VE: undefined, CO: undefined }
const TTL_MS = 60 * 60 * 1000

export async function GET() {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()

  const country = session.user.country as Country
  const now     = Date.now()
  const cached  = cache[country]
  if (cached && cached.expiresAt > now) {
    return NextResponse.json(cached.data, {
      headers: { 'X-Cache': 'HIT' },
    })
  }

  const { rows } = await db.query(
    `SELECT id, name,
            profit_percentage::float AS profit_percentage,
            color, description, display_order
     FROM profit_categories
     WHERE is_active = TRUE
     ORDER BY display_order, profit_percentage DESC`
  )
  cache[country] = { data: rows, expiresAt: now + TTL_MS }
  return NextResponse.json(rows, { headers: { 'X-Cache': 'MISS' } })
}
