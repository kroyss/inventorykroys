import { getDb } from '@/lib/db'
import { calcSpreadAndDiscount } from '@/lib/rateUtils'
import { fetchVEParallelRate } from '@/lib/binanceP2P'

// Lógica real de actualización (fetch a fuentes externas + upsert en DB) para
// VE y CO. La usan tanto el cron automático (/api/cron/rates) como el botón
// "Actualizar" del board público (/api/public/tasa/refresh) — un solo lugar
// para no triplicar esta lógica.

async function adminId(db: ReturnType<typeof getDb>): Promise<number | null> {
  const { rows } = await db.query(`SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1`)
  return rows[0]?.id ?? null
}

// ───────────────────────── Venezuela (BCV + Binance) ─────────────────────────
export async function refreshVERate() {
  const db = getDb('VE')

  const fetchOfficial = async (): Promise<number> => {
    const res = await fetch('https://ve.dolarapi.com/v1/dolares/oficial', {
      headers: { 'User-Agent': 'SyncsoraInventory/rates' },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status} para tasa oficial`)
    const data = await res.json()
    return parseFloat(data.promedio)
  }

  const [officialRaw, parallelResult] = await Promise.all([
    fetchOfficial(),
    fetchVEParallelRate(),
  ])
  const official_rate = Math.round(officialRaw)
  const parallel_rate = Math.round(parallelResult.rate)
  if (!(official_rate > 0) || !(parallel_rate > 0)) {
    throw new Error('API VE retornó valores inválidos')
  }

  const { rows: [last] } = await db.query(`
    SELECT excess_percentage FROM venezuela_exchange_rates
    ORDER BY rate_date DESC, created_at DESC LIMIT 1
  `)
  const excess = last ? parseFloat(last.excess_percentage) : 100.0
  const { spread, recommended_discount } = calcSpreadAndDiscount(official_rate, parallel_rate, excess)

  const { rows: [existing] } = await db.query(`
    SELECT id FROM venezuela_exchange_rates
    WHERE rate_date = CURRENT_DATE AND source = 'api'
    ORDER BY created_at DESC LIMIT 1
  `)

  let id: number, action: 'updated' | 'inserted'
  if (existing) {
    await db.query(`
      UPDATE venezuela_exchange_rates
      SET official_rate = $1, parallel_rate = $2, spread_percentage = $3,
          recommended_discount = $4, excess_percentage = $5, created_at = NOW()
      WHERE id = $6
    `, [official_rate, parallel_rate, spread, recommended_discount, excess, existing.id])
    id = existing.id; action = 'updated'
  } else {
    const { rows: [row] } = await db.query(`
      INSERT INTO venezuela_exchange_rates
        (rate_date, official_rate, parallel_rate, spread_percentage,
         recommended_discount, excess_percentage, source, created_by)
      VALUES (CURRENT_DATE, $1, $2, $3, $4, $5, 'api', $6)
      RETURNING id
    `, [official_rate, parallel_rate, spread, recommended_discount, excess, await adminId(db)])
    id = row.id; action = 'inserted'
  }

  // Poda: el historial es solo referencia, se conservan ~30 días.
  await db.query(`DELETE FROM venezuela_exchange_rates WHERE rate_date < CURRENT_DATE - INTERVAL '30 days'`)

  return {
    id, action, official_rate, parallel_rate,
    parallel_source: parallelResult.source,
    spread_percentage: spread, recommended_discount,
  }
}

// ───────────────────────── Colombia (TRM) ─────────────────────────
export async function refreshCORate() {
  const db = getDb('CO')

  const res = await fetch('https://co.dolarapi.com/v1/trm', {
    headers: { 'User-Agent': 'SyncsoraInventory/rates' },
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} para TRM`)
  const data = await res.json()
  const trm = Math.round(parseFloat(data.valor))
  if (!(trm > 0)) throw new Error('API CO retornó TRM inválida')

  const { rows: [existing] } = await db.query(`
    SELECT id FROM colombia_exchange_rates
    WHERE rate_date = CURRENT_DATE AND source = 'api'
    ORDER BY created_at DESC LIMIT 1
  `)

  let id: number, action: 'updated' | 'inserted'
  if (existing) {
    await db.query(
      `UPDATE colombia_exchange_rates SET trm_rate = $1, created_at = NOW() WHERE id = $2`,
      [trm, existing.id]
    )
    id = existing.id; action = 'updated'
  } else {
    const { rows: [row] } = await db.query(`
      INSERT INTO colombia_exchange_rates (rate_date, trm_rate, source, created_by)
      VALUES (CURRENT_DATE, $1, 'api', $2)
      RETURNING id
    `, [trm, await adminId(db)])
    id = row.id; action = 'inserted'
  }

  // Poda: el historial es solo referencia, se conservan ~30 días.
  await db.query(`DELETE FROM colombia_exchange_rates WHERE rate_date < CURRENT_DATE - INTERVAL '30 days'`)

  return { id, action, trm_rate: trm }
}
