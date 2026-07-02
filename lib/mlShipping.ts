// MercadoEnvíos VE — envío gratis por peso.
//
// ML Venezuela (caso atípico) da envío gratis según una tabla peso→precio mínimo:
// si tu precio de venta FINAL (con descuento) queda ≥ el mínimo del rango de peso del
// producto, la publicación tiene envío gratis. Si el descuento lo baja por debajo, se
// pierde. Con el peso registrado, el sistema calcula el descuento MÁXIMO que cada
// producto aguanta sin perder el envío gratis, y limita el descuento global a ese tope.
//
// Solo aplica a VE. La tabla cambia cada ~años → editable en Ajustes (app_settings
// key `ml_shipping_table`, JSON). Acá va el default (tabla vigente 2026).

export interface ShipTier {
  /** Peso máximo del rango en kg (el mínimo es el maxKg del rango anterior). */
  maxKg: number
  /** Precio mínimo (USD) del rango para tener envío gratis. */
  minPrice: number
}

export const DEFAULT_SHIPPING_TABLE: ShipTier[] = [
  { maxKg: 0.5,  minPrice: 4.95 },
  { maxKg: 1,    minPrice: 9.95 },
  { maxKg: 2,    minPrice: 19.95 },
  { maxKg: 3,    minPrice: 29.95 },
  { maxKg: 4,    minPrice: 39.95 },
  { maxKg: 5,    minPrice: 49.95 },
  { maxKg: 10,   minPrice: 59.95 },
  { maxKg: 40,   minPrice: 79.95 },
]

/** Lee la tabla de un objeto de settings; si no hay o es inválida, usa el default. */
export function parseShippingTable(raw: string | undefined | null): ShipTier[] {
  if (!raw) return DEFAULT_SHIPPING_TABLE
  try {
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr) || arr.length === 0) return DEFAULT_SHIPPING_TABLE
    const clean = arr
      .map(t => ({ maxKg: Number(t.maxKg), minPrice: Number(t.minPrice) }))
      .filter(t => t.maxKg > 0 && t.minPrice >= 0)
      .sort((a, b) => a.maxKg - b.maxKg)
    return clean.length ? clean : DEFAULT_SHIPPING_TABLE
  } catch {
    return DEFAULT_SHIPPING_TABLE
  }
}

/** Rango de peso que aplica; null si el peso no está registrado o supera el máximo. */
export function tierFor(weightKg: number | null | undefined, table: ShipTier[]): ShipTier | null {
  if (weightKg == null || !(weightKg > 0)) return null
  for (const t of table) if (weightKg <= t.maxKg) return t
  return null // por encima del rango más grande
}

export type ShipStatus =
  | 'ok'            // el descuento global entra completo, con envío gratis
  | 'capped'        // el global excede el máximo → se limitó para no perder el envío gratis
  | 'impossible'    // el publicado ya está bajo el umbral: nunca hay envío gratis (subir precio)
  | 'unregistered'  // falta registrar el peso
  | 'overweight'    // peso por encima del rango máximo de la tabla

export interface ShipInfo {
  tier: ShipTier | null
  /** Máximo % de descuento que mantiene envío gratis (null si no aplica). */
  maxDiscount: number | null
  /** Descuento realmente aplicado = global limitado por el máximo (o global si no aplica cap). */
  effectiveDiscount: number
  /** ¿Con el descuento efectivo hay envío gratis? */
  freeShip: boolean
  status: ShipStatus
}

/**
 * @param weightKg   peso del producto (kg) o null si no registrado
 * @param published  precio publicado (base × (1+exceso)), antes de descuento, en USD
 * @param globalDiscount descuento global configurado (%)
 * @param table      tabla de umbrales
 */
export function shipInfo(
  weightKg: number | null | undefined,
  published: number,
  globalDiscount: number,
  table: ShipTier[],
): ShipInfo {
  const tier = tierFor(weightKg, table)
  if (weightKg == null || !(weightKg > 0))
    return { tier: null, maxDiscount: null, effectiveDiscount: globalDiscount, freeShip: false, status: 'unregistered' }
  if (!tier)
    return { tier: null, maxDiscount: null, effectiveDiscount: globalDiscount, freeShip: false, status: 'overweight' }
  if (!(published > 0))
    return { tier, maxDiscount: null, effectiveDiscount: globalDiscount, freeShip: false, status: 'unregistered' }
  if (published < tier.minPrice)
    // Ni a 0% de descuento llega al umbral → nunca hay envío gratis.
    return { tier, maxDiscount: null, effectiveDiscount: globalDiscount, freeShip: false, status: 'impossible' }
  const maxDiscount = (1 - tier.minPrice / published) * 100
  const effectiveDiscount = Math.min(globalDiscount, maxDiscount)
  return {
    tier,
    maxDiscount,
    effectiveDiscount,
    freeShip: true,
    status: globalDiscount > maxDiscount + 1e-9 ? 'capped' : 'ok',
  }
}
