import type { Country } from '@/lib/types'

// Largos VÁLIDOS (en dígitos) del número de orden de MercadoLibre por país,
// confirmados con datos reales:
//   VE → 16 (ej. 2000015393340290)
//   CO → 12 o 16 (ej. 164540355537 / 2000013621585393)
// Cualquier otro largo (muy corto por typo, o el doble por pegar dos veces) se
// rechaza. Las ventas LOCAL tienen su propio formato (LOCAL-XXXXXX) y NO se validan.
export const ML_ORDER_LENGTHS: Record<Country, number[]> = {
  VE: [16],
  CO: [12, 16],
}

// Etiqueta legible de los largos válidos, ej. "16 dígitos" o "12 o 16 dígitos".
export function orderLenLabel(country: Country): string {
  return `${ML_ORDER_LENGTHS[country].join(' o ')} dígitos`
}

// Orden ML válida: solo dígitos, sin espacios, con uno de los largos del país.
export function isValidMlOrderNumber(country: Country, raw: string): boolean {
  return mlOrderError(country, raw) === null
}

// Mensaje de error si el número no es válido, o null si está bien.
export function mlOrderError(country: Country, raw: string): string | null {
  const num = (raw ?? '').trim()
  if (num.startsWith('LOCAL-')) return null
  if (!/^\d+$/.test(num)) return 'El número de orden ML debe ser solo dígitos (sin espacios ni otros caracteres).'
  if (!ML_ORDER_LENGTHS[country].includes(num.length)) {
    return `El número de orden ML debe tener ${orderLenLabel(country)} (tiene ${num.length}). Revisá que no lo hayas pegado dos veces ni quedado incompleto.`
  }
  return null
}
