import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { getDb } from '@/lib/db'
import { calcSpreadAndDiscount } from '@/lib/rateUtils'

// Endpoint de actualización automática de la tasa BCV (solo VE).
// NO usa sesión: lo dispara el crontab del VPS con un secreto compartido.
//   curl -fsS "https://inventory.syncsora.com/api/cron/rates?key=EL_SECRETO"
// Protegido por CRON_SECRET (header Authorization: Bearer ... o query ?key=).
// Idempotente por día: si ya hay una fila 'api' de hoy, la ACTUALIZA en vez de
// insertar otra, así el historial no se llena con varias filas por día.

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const url = new URL(req.url)
  const key = url.searchParams.get('key')
  const auth = req.headers.get('authorization')
  return key === secret || auth === `Bearer ${secret}`
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const db = getDb('VE')

  try {
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

    if (official_rate <= 0 || parallel_rate <= 0) {
      return NextResponse.json({ error: 'API retornó valores inválidos' }, { status: 503 })
    }

    const { rows: [last] } = await db.query(`
      SELECT excess_percentage FROM venezuela_exchange_rates
      ORDER BY rate_date DESC, created_at DESC LIMIT 1
    `)
    const excess = last ? parseFloat(last.excess_percentage) : 100.0
    const { spread, recommended_discount } = calcSpreadAndDiscount(official_rate, parallel_rate, excess)

    // ¿Ya existe una fila 'api' de hoy? → actualizar; si no, insertar.
    const { rows: [existing] } = await db.query(`
      SELECT id FROM venezuela_exchange_rates
      WHERE rate_date = CURRENT_DATE AND source = 'api'
      ORDER BY created_at DESC LIMIT 1
    `)

    let id: number
    let action: 'updated' | 'inserted'
    if (existing) {
      await db.query(`
        UPDATE venezuela_exchange_rates
        SET official_rate = $1, parallel_rate = $2, spread_percentage = $3,
            recommended_discount = $4, excess_percentage = $5, created_at = NOW()
        WHERE id = $6
      `, [official_rate, parallel_rate, spread, recommended_discount, excess, existing.id])
      id = existing.id
      action = 'updated'
    } else {
      const { rows: [row] } = await db.query(`
        INSERT INTO venezuela_exchange_rates
          (rate_date, official_rate, parallel_rate, spread_percentage,
           recommended_discount, excess_percentage, source, created_by)
        VALUES (CURRENT_DATE, $1, $2, $3, $4, $5, 'api',
                (SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1))
        RETURNING id
      `, [official_rate, parallel_rate, spread, recommended_discount, excess])
      id = row.id
      action = 'inserted'
    }

    return NextResponse.json({
      id, action,
      message: 'Tasa BCV actualizada por cron',
      official_rate, parallel_rate,
      spread_percentage: spread,
      excess_percentage: excess,
      recommended_discount,
      source: 'api',
    })
  } catch (err) {
    return apiError(err)
  }
}
