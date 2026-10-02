// Cuentas de MercadoLibre de la empresa (app_settings `ml_cuentas`, JSON ["CUENTA", ...]).
// Se usan para los casilleros de códigos ML de cada producto (el código se escribe a mano). Se
// editan en Ajustes; si la empresa no escribió ninguna, se usan las cuentas que conectó (OAuth).
export async function cuentasML(db: { query: (sql: string) => Promise<{ rows: { value: string }[] }> }): Promise<string[]> {
  const { rows: [r] } = await db.query(`SELECT value FROM app_settings WHERE key = 'ml_cuentas'`)
  let cuentas: string[] = []
  try {
    const v = JSON.parse(r?.value ?? '[]')
    cuentas = Array.isArray(v) ? v.map(String).map(s => s.trim()).filter(Boolean).slice(0, 10) : []
  } catch { /* JSON roto: como si no hubiera */ }
  if (cuentas.length) return cuentas
  try {
    const { rows } = await db.query(
      `SELECT DISTINCT UPPER(nickname) AS value FROM ml_conexiones WHERE estado = 'activa' ORDER BY 1 LIMIT 10`)
    return rows.map(x => x.value)
  } catch {
    return []
  }
}
