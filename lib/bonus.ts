// Bonos por ventas del mes — 3 fases acumulativas.
//
// El vendedor cobra el bono de cada fase que alcanza: si el mes cierra en $16.000
// con la config default cobró $100 + $200 = $300. Las metas y los montos son
// editables por país en Ajustes (app_settings, keys `bono_meta_N` / `bono_monto_N`),
// porque el volumen de VE y CO no es comparable.

export interface BonusPhase {
  phase: number
  label: string
  /** Ventas del mes desde las que arranca la fase (= meta de la fase anterior). */
  start: number
  /** Meta: ventas del mes necesarias para cobrar el bono. */
  end: number
  /** Monto del bono, en la moneda en que se miden las ventas del país. */
  bonus: number
}

export const BONUS_PHASES = 3
export const DEFAULT_BONUS_METAS  = [10000, 15000, 20000]
export const DEFAULT_BONUS_MONTOS = [100, 200, 300]

/**
 * Arma las 3 fases desde un objeto de settings (`{ bono_meta_1: '12000', … }`).
 * Si las metas no son crecientes o falta algún valor, cae al default completo:
 * una escalera mal formada rompería el cálculo de progreso.
 */
export function parseBonusPhases(
  s: Record<string, string | number | undefined | null> | null | undefined
): BonusPhase[] {
  const num = (key: string, fallback: number) => {
    const v = s?.[key]
    if (v === undefined || v === null || v === '') return fallback
    const n = Number(v)
    return Number.isFinite(n) && n > 0 ? n : fallback
  }

  const metas  = DEFAULT_BONUS_METAS.map((d, i)  => num(`bono_meta_${i + 1}`,  d))
  const montos = DEFAULT_BONUS_MONTOS.map((d, i) => num(`bono_monto_${i + 1}`, d))

  const creciente = metas.every((m, i) => i === 0 || m > metas[i - 1])
  const finales = creciente ? metas : DEFAULT_BONUS_METAS

  return finales.map((end, i) => ({
    phase: i + 1,
    label: `Fase ${i + 1}`,
    start: i === 0 ? 0 : finales[i - 1],
    end,
    bonus: montos[i],
  }))
}
