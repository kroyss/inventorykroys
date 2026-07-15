import { getDb } from '@/lib/db'
import { calcSpreadAndDiscount } from '@/lib/rateUtils'

// Lectura pública de la última tasa cacheada (VE oficial/paralelo + TRM CO).
// La llena el cron de /api/cron/rates varias veces al día — esto SOLO lee lo
// último ya guardado, nunca dispara un fetch a Binance/dolarapi, para que un
// botón sin login no pueda usarse para bombardear esas APIs externas.
export interface PublicRates {
  ve: { official_rate: number; parallel_rate: number; spread_percentage: number; updated_at: string | null }
  co: { trm_rate: number; updated_at: string | null }
}

export async function getPublicRates(): Promise<PublicRates> {
  const [ve, co] = await Promise.allSettled([
    getDb('VE').query(`
      SELECT official_rate, parallel_rate, excess_percentage, created_at
      FROM venezuela_exchange_rates
      ORDER BY rate_date DESC, created_at DESC LIMIT 1
    `),
    getDb('CO').query(`
      SELECT trm_rate::float AS trm_rate, created_at
      FROM colombia_exchange_rates
      ORDER BY rate_date DESC, created_at DESC LIMIT 1
    `),
  ])

  const veRow = ve.status === 'fulfilled' ? ve.value.rows[0] : undefined
  const coRow = co.status === 'fulfilled' ? co.value.rows[0] : undefined

  const official = veRow ? parseFloat(veRow.official_rate) : 0
  const parallel = veRow ? parseFloat(veRow.parallel_rate) : 0
  const excess   = veRow ? parseFloat(veRow.excess_percentage) : 0
  const spread   = official > 0 ? calcSpreadAndDiscount(official, parallel, excess).spread : 0

  return {
    ve: {
      official_rate:     official,
      parallel_rate:     parallel,
      spread_percentage: spread,
      updated_at:        veRow?.created_at ? new Date(veRow.created_at).toISOString() : null,
    },
    co: {
      trm_rate:   coRow?.trm_rate ?? 0,
      updated_at: coRow?.created_at ? new Date(coRow.created_at).toISOString() : null,
    },
  }
}
