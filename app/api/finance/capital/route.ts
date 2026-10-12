import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { getFinanceSession } from '@/lib/finance'
import { unauthorized, forbidden } from '@/lib/session'
import { getCapital } from '@/lib/financeData'
import { puede } from '@/lib/permisos'

export async function GET(_: NextRequest) {
  const { session, db, dbs } = await getFinanceSession()
  if (!session || !db || !dbs) return unauthorized()
  if (!puede(session.user, 'ver_finanzas')) return forbidden()

  try {
    return NextResponse.json(await getCapital(dbs))
  } catch (err) {
    return apiError(err)
  }
}
