// Tablas de envío gratis ZOOM y TEALCA, para el servidor (19-10). Desde 14-11 son globales (lib/tablasEnvioGlobal.ts).
import type { Pool, PoolClient } from 'pg'
import { tablasEnvio, type TablasEnvio } from '@/lib/mlShipping'
import { tablasEnvioGlobales } from '@/lib/tablasEnvioGlobal'

export async function leerTablasEnvio(db: Pool | PoolClient): Promise<TablasEnvio> {
  const { rows } = await db.query(
    `SELECT key, value FROM app_settings WHERE key IN ('ml_shipping_table', 'ml_shipping_table_zoom')`).catch(() => ({ rows: [] as { key: string; value: string }[] }))
  const s: Record<string, string> = {}
  for (const r of rows) s[r.key] = r.value
  return tablasEnvio({ ...s, ...(await tablasEnvioGlobales()) })   // 14-11: la global manda (lib/tablasEnvioGlobal.ts)
}
