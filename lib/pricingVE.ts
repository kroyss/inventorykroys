// Precios y margen neto de ML — funciones puras compartidas.
//
// Viven acá (y no dentro de ProductosClient) para que el catálogo, la ficha y la
// revisión de márgenes calculen con el MISMO código: si cada pantalla tiene su
// copia de la fórmula, tarde o temprano muestran números distintos.
//
//  Precio base    = costo total × (1 + ganancia%)          (markup sobre costo)
//  Precio sug. ML = precio base × (1 + exceso%)            (lo que publicas en VE)
//  Precio final   = publicado × (1 − descuento%)
//  Recibes (par.) = (final × oficial) ÷ paralelo           (al cambiar Bs a paralelo)

import type { Country } from '@/lib/types'
import { parseShippingTable, shippingCostVE, type ShipTier } from '@/lib/mlShipping'

export interface VeRate { official: number; parallel: number; excess: number }

// Precio final VE calculado EN VIVO desde el costo y la config actual (categoría → base,
// exceso, descuento), para que catálogo, vista y calculadora coincidan. El final_price_usd
// guardado queda viejo cuando cambia el exceso/costo y no se re-guarda el producto.
export function liveBaseVE(p: { total_cost: number; profit_percentage: number }): number {
  return p.total_cost * (1 + (p.profit_percentage ?? 0) / 100)
}
// El descuento aplicado es GLOBAL (config en Ajustes); si no se pasa, cae al del producto.
export function liveFinalVE(p: { total_cost: number; profit_percentage: number; discount_percent: number }, excess: number, discount?: number): number {
  const d = discount ?? p.discount_percent ?? 0
  return liveBaseVE(p) * (1 + excess / 100) * (1 - d / 100)
}
// Precio publicado en ML = base × (1 + exceso), antes del descuento.
export function livePublishedVE(p: { total_cost: number; profit_percentage: number }, excess: number): number {
  return liveBaseVE(p) * (1 + excess / 100)
}
// Descuento recomendado VE (depende solo de exceso + tasas; la base se cancela).
export function recDiscountVE(rate: VeRate | null): number {
  if (!rate || !(rate.parallel > rate.official) || !(rate.official > 0)) return 0
  return Math.max(0, (1 - (1.05 * rate.parallel) / ((1 + (rate.excess ?? 0) / 100) * rate.official)) * 100)
}
/** Descuento GLOBAL efectivo (VE): el manual de Ajustes (ml_descuento) o, si está vacío, el recomendado. */
export function globalDiscountVE(settings: Record<string, string>, rate: VeRate | null): number {
  const raw = settings.ml_descuento
  const n = raw == null || raw === '' ? NaN : parseFloat(raw)
  return isNaN(n) ? recDiscountVE(rate) : n
}

// Margen NETO real por producto (después de comisiones de ML), por país.
// Reusa las mismas fórmulas que el simulador de Ajustes y la calculadora:
//   VE: ingreso real = precio final llevado a paralelo; − comisión % − envío (con prorrateo bajo el umbral).
//   CO: ingreso = precio de venta en pesos; − comisión % − envío por umbral − retención.
// margen = ganancia ÷ ingreso real (SOBRE VENTA), consistente en ambos países. null si falta dato.
export function mlNetFor(
  country: Country,
  p: { total_cost: number; profit_percentage: number; discount_percent: number; sale_price: number; weight_kg?: number | null },
  veRate: VeRate | null, coTrm: number, ml: Record<string, string>, discount?: number,
  shipTable?: ShipTier[],
): { ganancia: number; margen: number; pesos: boolean } | null {
  const num = (k: string, d: number) => { const v = parseFloat(ml[k]); return isNaN(v) ? d : v }
  if (country === 'CO') {
    const price = p.sale_price
    if (!(price > 0) || !(coTrm > 0) || !(p.total_cost > 0)) return null
    const comision = price * num('ml_comision', 15.5) / 100
    const envio    = price >= num('ml_umbral_envio', 60000) ? num('ml_envio_alto', 8000) : num('ml_envio_bajo', 2600)
    const reten    = price * num('ml_reten', 1.91) / 100
    const ganancia = (price - comision - envio - reten) - p.total_cost * coTrm
    return { ganancia, margen: ganancia / price * 100, pesos: true }
  }
  // VE: precio publicado calculado EN VIVO (base × exceso actual × (1−descuento)), igual que
  // la calculadora — así no se desincroniza con el final_price_usd guardado (que queda viejo
  // cuando cambia el exceso o no se re-guardó el producto).
  if (!veRate || !(veRate.parallel > 0) || !(veRate.official > 0)) return null
  const finalLive = liveFinalVE(p, veRate.excess ?? 0, discount)
  if (!(finalLive > 0)) return null
  const realUsd  = finalLive * veRate.official / veRate.parallel
  // Envío según el mínimo del rango de peso del producto (tabla de MercadoEnvíos).
  const envio    = shippingCostVE(finalLive, p.weight_kg, shipTable ?? parseShippingTable(ml.ml_shipping_table),
                                  num('ml_envio', 0.65), num('ml_umbral', 5))
  const neto     = realUsd * (1 - num('ml_comision', 12) / 100) - envio
  const ganancia = neto - p.total_cost
  return { ganancia, margen: ganancia / realUsd * 100, pesos: false }
}

/**
 * Precios a GUARDAR de un producto VE con una categoría dada (lo mismo que envía la
 * ficha al guardar). Sirve para que un cambio de categoría deje los precios guardados
 * al día: el precio de inventario (que usan ventas, reportes y la hoja de inventario)
 * sigue al precio base.
 */
export function storedPricesVE(
  totalCost: number, profitPct: number, excess: number, effDiscount: number, official: number,
) {
  const base      = totalCost * (1 + profitPct / 100)
  const published = base * (1 + excess / 100)
  const final     = published * (1 - effDiscount / 100)
  return {
    base_price_usd:      base,
    published_price_usd: published,
    final_price_usd:     final,
    price_bolivares:     final * official,
    discount_percent:    effDiscount,
    sale_price:          base,
  }
}
