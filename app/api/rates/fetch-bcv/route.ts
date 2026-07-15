import { NextRequest, NextResponse } from 'next/server'
import { getSessionDb, unauthorized, forbidden } from '@/lib/session'
import { calcSpreadAndDiscount } from '@/lib/rateUtils'
import { fetchVEParallelRate } from '@/lib/binanceP2P'

export async function GET(_: NextRequest) {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  if (session.user.role !== 'admin') return forbidden()
  if (session.user.country !== 'VE') {
    return NextResponse.json({ error: 'Solo disponible para Venezuela' }, { status: 403 })
  }

  const userId = parseInt(session.user.id, 10)

  try {
    const fetchOfficial = async (): Promise<number> => {
      const res = await fetch('https://ve.dolarapi.com/v1/dolares/oficial', {
        headers: { 'User-Agent': 'KroysInventory/3.0' },
        signal: AbortSignal.timeout(10000),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status} para tasa oficial`)
      const data = await res.json()
      return parseFloat(data.promedio)
    }

    const [official_rate, parallelResult] = await Promise.all([
      fetchOfficial(),
      fetchVEParallelRate(),
    ])
    const parallel_rate = parallelResult.rate

    if (official_rate <= 0 || parallel_rate <= 0) {
      return NextResponse.json({ error: 'API retornó valores inválidos' }, { status: 503 })
    }

    const { rows: [last] } = await db.query(`
      SELECT excess_percentage FROM venezuela_exchange_rates
      ORDER BY rate_date DESC, created_at DESC LIMIT 1
    `)
    const excess = last ? parseFloat(last.excess_percentage) : 100.0
    const { spread, recommended_discount } = calcSpreadAndDiscount(official_rate, parallel_rate, excess)

    const { rows: [row] } = await db.query(`
      INSERT INTO venezuela_exchange_rates
        (rate_date, official_rate, parallel_rate, spread_percentage,
         recommended_discount, excess_percentage, source, created_by)
      VALUES (CURRENT_DATE, $1, $2, $3, $4, $5, 'api', $6)
      RETURNING id
    `, [official_rate, parallel_rate, spread, recommended_discount, excess, userId])

    // Poda: el historial es solo referencia, se conservan ~30 días.
    await db.query(`DELETE FROM venezuela_exchange_rates WHERE rate_date < CURRENT_DATE - INTERVAL '30 days'`)

    return NextResponse.json({
      id: row.id,
      message: `Tasa actualizada (oficial BCV + paralelo ${parallelResult.source === 'binance' ? 'Binance' : 'dolarapi, fallback'})`,
      official_rate, parallel_rate,
      spread_percentage:    spread,
      excess_percentage:    excess,
      recommended_discount,
      source: 'api',
      parallel_source: parallelResult.source,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 503 })
  }
}
