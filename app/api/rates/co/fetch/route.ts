import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized, forbidden } from '@/lib/session'

// Actualización MANUAL de la TRM desde co.dolarapi.com (admin + CO).
// Mismo upsert idempotente por día que el cron; útil si la API del cron falló.
export async function GET(_: NextRequest) {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  if (session.user.role !== 'admin') return forbidden()
  if (session.user.country !== 'CO') {
    return NextResponse.json({ error: 'Solo disponible para Colombia' }, { status: 403 })
  }

  try {
    const res = await fetch('https://co.dolarapi.com/v1/trm', {
      headers: { 'User-Agent': 'SyncsoraInventory/manual' },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status} al consultar la TRM`)
    const data = await res.json()
    const trm = Math.round(parseFloat(data.valor))
    if (!(trm > 0)) throw new Error('La API retornó una TRM inválida')

    const { rows: [existing] } = await db.query(
      `SELECT id FROM colombia_exchange_rates
       WHERE rate_date = CURRENT_DATE AND source = 'api'
       ORDER BY created_at DESC LIMIT 1`
    )
    if (existing) {
      await db.query(
        `UPDATE colombia_exchange_rates SET trm_rate = $1, created_at = NOW() WHERE id = $2`,
        [trm, existing.id]
      )
    } else {
      await db.query(
        `INSERT INTO colombia_exchange_rates (rate_date, trm_rate, source, created_by)
         VALUES (CURRENT_DATE, $1, 'api', (SELECT id FROM users WHERE role='admin' ORDER BY id LIMIT 1))`,
        [trm]
      )
    }

    // Poda: el historial es solo referencia, se conservan ~30 días.
    await db.query(`DELETE FROM colombia_exchange_rates WHERE rate_date < CURRENT_DATE - INTERVAL '30 days'`)

    return NextResponse.json({ ok: true, trm_rate: trm })
  } catch (err) {
    return apiError(err)
  }
}
