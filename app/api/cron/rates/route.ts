import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { calcSpreadAndDiscount } from '@/lib/rateUtils'

// Cron de tasas (lo dispara el crontab del VPS con un secreto compartido).
// NO usa sesión. Actualiza AMBOS países en una sola pasada:
//   - VE: BCV oficial + paralelo desde ve.dolarapi.com  → venezuela_exchange_rates
//   - CO: TRM desde co.dolarapi.com/v1/trm              → colombia_exchange_rates
//   curl -fsS "https://inventory.syncsora.com/api/cron/rates?key=EL_SECRETO"
// Cada país en su propio try/catch: si uno falla, el otro igual se actualiza.
// Idempotente por día: si ya hay una fila 'api' de hoy, la ACTUALIZA (no duplica).

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const url = new URL(req.url)
  const key = url.searchParams.get('key')
  const auth = req.headers.get('authorization')
  return key === secret || auth === `Bearer ${secret}`
}

async function adminId(db: ReturnType<typeof getDb>): Promise<number | null> {
  const { rows } = await db.query(`SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1`)
  return rows[0]?.id ?? null
}

// ───────────────────────── Venezuela (BCV) ─────────────────────────
async function updateVE() {
  const db = getDb('VE')

  const fetchRate = async (type: 'oficial' | 'paralelo'): Promise<number> => {
    const res = await fetch(`https://ve.dolarapi.com/v1/dolares/${type}`, {
      headers: { 'User-Agent': 'SyncsoraInventory/cron' },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status} para tasa ${type}`)
    const data = await res.json()
    return parseFloat(data.promedio)
  }

  const [official_rate, parallel_rate] = await Promise.all([
    fetchRate('oficial'),
    fetchRate('paralelo'),
  ])
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

  return { id, action, official_rate, parallel_rate, spread_percentage: spread, recommended_discount }
}

// ───────────────────────── Colombia (TRM) ─────────────────────────
async function updateCO() {
  const db = getDb('CO')

  const res = await fetch('https://co.dolarapi.com/v1/trm', {
    headers: { 'User-Agent': 'SyncsoraInventory/cron' },
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} para TRM`)
  const data = await res.json()
  const trm = parseFloat(data.valor)
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

  return { id, action, trm_rate: trm }
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const result: { ve: unknown; co: unknown } = { ve: null, co: null }
  try { result.ve = await updateVE() } catch (e) { result.ve = { error: e instanceof Error ? e.message : String(e) } }
  try { result.co = await updateCO() } catch (e) { result.co = { error: e instanceof Error ? e.message : String(e) } }

  return NextResponse.json(result)
}
