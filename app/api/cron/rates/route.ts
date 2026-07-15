import { NextRequest, NextResponse } from 'next/server'
import { refreshVERate, refreshCORate } from '@/lib/ratesRefresh'

// Cron de tasas (lo dispara el crontab del VPS con un secreto compartido).
// NO usa sesión. Actualiza AMBOS países en una sola pasada:
//   - VE: BCV oficial (dolarapi) + paralelo (Binance P2P, fallback dolarapi) → venezuela_exchange_rates
//   - CO: TRM desde co.dolarapi.com/v1/trm                                  → colombia_exchange_rates
//   curl -fsS "https://inventory.syncsora.com/api/cron/rates?key=EL_SECRETO"
// Cada país en su propio try/catch: si uno falla, el otro igual se actualiza.
// Idempotente por día: si ya hay una fila 'api' de hoy, la ACTUALIZA (no duplica).
// La lógica de fetch+upsert vive en lib/ratesRefresh.ts (compartida con el
// botón "Actualizar" del board público /tasa).

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

  const result: { ve: unknown; co: unknown } = { ve: null, co: null }
  try { result.ve = await refreshVERate() } catch (e) { result.ve = { error: e instanceof Error ? e.message : String(e) } }
  try { result.co = await refreshCORate() } catch (e) { result.co = { error: e instanceof Error ? e.message : String(e) } }

  return NextResponse.json(result)
}
