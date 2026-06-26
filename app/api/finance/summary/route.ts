import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { getFinanceSession } from '@/lib/finance'
import { unauthorized, forbidden } from '@/lib/session'
import { getMonthlyClose } from '@/lib/financeData'
import { currentYearMonth } from '@/lib/tz'

const MONTH_RE = /^\d{4}-\d{2}$/

export async function GET(req: NextRequest) {
  const { session, db } = await getFinanceSession()
  if (!session || !db) return unauthorized()
  if (session.user.role !== 'admin') return forbidden()

  try {
    const m = new URL(req.url).searchParams.get('month') ?? ''
    const month = MONTH_RE.test(m) ? m : currentYearMonth()
    return NextResponse.json(await getMonthlyClose(month))
  } catch (err) {
    return apiError(err)
  }
}
