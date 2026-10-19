// Tablas de envío gratis ZOOM y TEALCA de la empresa (Ajustes), para el servidor (19-10).
import type { Pool, PoolClient } from 'pg'
import { tablasEnvio, type TablasEnvio } from '@/lib/mlShipping'

export async function leerTablasEnvio(db: Pool | PoolClient): Promise<TablasEnvio> {
  const { rows } = await db.query(
    `SELECT key, value FROM app_settings WHERE key IN ('ml_shipping_table', 'ml_shipping_table_zoom')`).catch(() => ({ rows: [] as { key: string; value: string }[] }))
  const s: Record<string, string> = {}
  for (const r of rows) s[r.key] = r.value
  return tablasEnvio(s)
}
