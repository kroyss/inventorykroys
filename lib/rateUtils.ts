// Formula: recommended_discount = max(0, (1 - (1.05 × parallel) / ((1 + excess/100) × official)) × 100)
export function calcSpreadAndDiscount(
  official: number,
  parallel: number,
  excess: number,
): { spread: number; recommended_discount: number } {
  const spread       = ((parallel - official) / official) * 100
  const excessFactor = 1 + excess / 100
  const recommended_discount =
    excessFactor > 0 && official > 0
      ? Math.max(0, (1 - (1.05 * parallel) / (excessFactor * official)) * 100)
      : 0
  return {
    spread:               Math.round(spread * 100) / 100,
    recommended_discount: Math.round(recommended_discount * 100) / 100,
  }
}

// Exceso % (precio sugerido ML sobre el base): es de CADA EMPRESA (app_settings
// `ml_exceso`), no de la tasa del día, que es común a todas. Sin valor guardado: 100.
export const EXCESO_DEFAULT = 100
export async function excesoEmpresa(db: { query: (sql: string) => Promise<{ rows: { value: string }[] }> }) {
  const { rows: [r] } = await db.query(`SELECT value FROM app_settings WHERE key = 'ml_exceso'`)
  const n = parseFloat(r?.value ?? '')
  return Number.isFinite(n) && n >= 0 && n <= 500 ? n : EXCESO_DEFAULT
}
