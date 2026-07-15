import { NextResponse } from 'next/server'
import { getPublicRates } from '@/lib/publicRates'
import { refreshVERate, refreshCORate } from '@/lib/ratesRefresh'

// Público, sin sesión — botón "Actualizar" de /tasa. A diferencia de
// GET /api/public/tasa (solo lee caché), este SÍ dispara un fetch real a
// Binance/dolarapi y lo guarda en las mismas tablas que usa todo el sistema
// (venezuela_exchange_rates / colombia_exchange_rates).
//
// Cooldown corto: si la última actualización (de cualquier origen: este
// botón u otro empleado) fue hace menos de COOLDOWN_MS, NO vuelve a pegarle
// a las APIs externas — devuelve el caché tal cual. Evita que varios
// empleados apretando "Actualizar" a la vez terminen bombardeando Binance.
const COOLDOWN_MS = 3 * 60 * 1000

export async function POST() {
  const current = await getPublicRates()
  const lastUpdates = [current.ve.updated_at, current.co.updated_at]
    .filter((d): d is string => !!d)
    .map(d => new Date(d).getTime())
  const mostRecent = lastUpdates.length ? Math.max(...lastUpdates) : 0

  if (Date.now() - mostRecent < COOLDOWN_MS) {
    return NextResponse.json({ ...current, refreshed: false })
  }

  const errors: string[] = []
  try { await refreshVERate() } catch (e) { errors.push(`VE: ${e instanceof Error ? e.message : String(e)}`) }
  try { await refreshCORate() } catch (e) { errors.push(`CO: ${e instanceof Error ? e.message : String(e)}`) }

  const updated = await getPublicRates()
  return NextResponse.json({
    ...updated,
    refreshed: errors.length === 0,
    ...(errors.length ? { errors } : {}),
  })
}
