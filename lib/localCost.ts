import { getDb } from '@/lib/db'
import type { Country } from '@/lib/types'

// Factor para expresar el costo (product_pricing.total_cost) en la MONEDA LOCAL
// de operación de cada país, y que ganancia/margen cuadren contra las ventas:
//   - VE: el costo ya está en USD, que es la moneda de operación → factor 1.
//   - CO: el costo está en USD pero se vende/opera en pesos → factor = TRM (USD→COP).
// Así "ganancia = ventas(local) − costo(USD × factor)" queda consistente por país.
// Si no hay TRM (CO), cae a 1 para no romper (no debería pasar: el cron la siembra).
export async function localCostFactor(country: Country): Promise<number> {
  if (country !== 'CO') return 1
  try {
    const { rows } = await getDb('CO').query(
      `SELECT trm_rate::float AS r FROM colombia_exchange_rates
       ORDER BY rate_date DESC, created_at DESC LIMIT 1`
    )
    return rows[0]?.r || 1
  } catch {
    return 1
  }
}
