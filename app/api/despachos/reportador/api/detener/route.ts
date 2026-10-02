import { NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized } from '@/lib/session'
import { reportadorForbidden } from '@/lib/despachos'
import { detenerCorrida } from '@/lib/reportadorCorrida'

// POST /api/despachos/reportador/api/detener → pide detener la corrida en curso (entre lotes).
export async function POST() {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  const denied = reportadorForbidden(session)
  if (denied) return denied
  try {
    await detenerCorrida(db)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return apiError(err)
  }
}
