// Cuentas de MercadoLibre de la empresa (app_settings `ml_cuentas`, JSON ["CUENTA", ...]).
// Se usan para los códigos ML de cada producto. Se editan en Ajustes.
export async function cuentasML(db: { query: (sql: string) => Promise<{ rows: { value: string }[] }> }): Promise<string[]> {
  const { rows: [r] } = await db.query(`SELECT value FROM app_settings WHERE key = 'ml_cuentas'`)
  try {
    const v = JSON.parse(r?.value ?? '[]')
    return Array.isArray(v) ? v.map(String).map(s => s.trim()).filter(Boolean).slice(0, 10) : []
  } catch {
    return []
  }
}
