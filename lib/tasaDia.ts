import type { Pool } from 'pg'

/** Tasa BCV más reciente (tabla global venezuela_exchange_rates), para las variables de las respuestas rápidas
 *  (lib/variablesTexto.ts). Con la conexión que ya tiene el request: no abre otra. */
export async function tasaBCVHoy(db: Pick<Pool, 'query'>): Promise<number | null> {
  const { rows: [r] } = await db.query(
    `SELECT official_rate::float AS t FROM venezuela_exchange_rates ORDER BY rate_date DESC, created_at DESC LIMIT 1`)
    .catch(() => ({ rows: [] as { t: number }[] }))
  return r?.t ?? null
}
