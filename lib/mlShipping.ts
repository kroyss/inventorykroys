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

/**
 * Mínimo de unidades para que un carrito de ese producto alcance el envío gratis.
 * OJO: al sumar unidades, el PESO total también sube y puede saltar a un rango con
 * umbral mayor → se busca iterando, no dividiendo. null si no se alcanza (peso total
 * fuera de tabla o precio demasiado bajo).
 */
export function unitsForFreeShip(
  weightKg: number, unitPrice: number, table: ShipTier[], maxUnits = 30,
): number | null {
  if (!(weightKg > 0) || !(unitPrice > 0)) return null
  for (let n = 1; n <= maxUnits; n++) {
    const t = tierFor(weightKg * n, table)
    if (!t) return null // el peso total se salió de la tabla
    if (unitPrice * n >= t.minPrice) return n
  }
  return null
}

export type ShipStatus =
  | 'ok'            // el descuento global entra completo, con envío gratis a 1 unidad
  | 'capped'        // el global excede el máximo → se limitó para no perder el envío gratis
  | 'aggregate'     // a 1 unidad no llega, pero SÍ juntando N unidades (normal en productos baratos)
  | 'impossible'    // ni juntando unidades llega: precio demasiado bajo para su peso (revisar)
  | 'unregistered'  // falta registrar el peso
  | 'overweight'    // peso por encima del rango máximo de la tabla

export interface ShipInfo {
  tier: ShipTier | null
  /** Máximo % de descuento que mantiene envío gratis a 1 unidad (null si no aplica). */
  maxDiscount: number | null
  /** Descuento realmente aplicado = global limitado por el máximo (o global si no aplica cap). */
  effectiveDiscount: number
  /** ¿Con el descuento efectivo hay envío gratis a 1 unidad? */
  freeShip: boolean
  /** Unidades para envío gratis (1 si aplica solo; N si es por volumen; null si no aplica). */
  unitsForFree: number | null
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
    return { tier: null, maxDiscount: null, effectiveDiscount: globalDiscount, freeShip: false, unitsForFree: null, status: 'unregistered' }
  if (!tier)
    return { tier: null, maxDiscount: null, effectiveDiscount: globalDiscount, freeShip: false, unitsForFree: null, status: 'overweight' }
  if (!(published > 0))
    return { tier, maxDiscount: null, effectiveDiscount: globalDiscount, freeShip: false, unitsForFree: null, status: 'unregistered' }

  if (published >= tier.minPrice) {
    // Envío gratis ya a 1 unidad: el descuento puede bajarlo hasta el umbral.
    const maxDiscount = (1 - tier.minPrice / published) * 100
    const effectiveDiscount = Math.min(globalDiscount, maxDiscount)
    return {
      tier, maxDiscount, effectiveDiscount, freeShip: true, unitsForFree: 1,
      status: globalDiscount > maxDiscount + 1e-9 ? 'capped' : 'ok',
    }
  }

  // Publicado por debajo del umbral: a 1 unidad no hay envío gratis. Sin cap (no hay
  // nada que proteger a 1 unidad) → descuento global completo. ¿Se alcanza por volumen?
  const finalUnit = published * (1 - globalDiscount / 100)
  const units = unitsForFreeShip(weightKg, finalUnit, table)
  return {
    tier, maxDiscount: null, effectiveDiscount: globalDiscount, freeShip: false,
    unitsForFree: units, status: units ? 'aggregate' : 'impossible',
  }
}
