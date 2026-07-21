import type { Country } from '@/lib/types'

// Largo EXACTO (en dígitos) del número de orden de MercadoLibre por país.
// Confirmado con datos reales: VE = 16 dígitos (ej. 2000015393340290).
// CO: confirmar con la misma query antes de deployar; ajustar si difiere.
// Las ventas LOCAL tienen su propio formato (LOCAL-XXXXXX) y NO se validan acá.
export const ML_ORDER_LENGTH: Record<Country, number> = {
  VE: 16,
  CO: 16,
}

// Orden ML válida: solo dígitos, exactamente el largo del país, sin espacios.
// Las LOCAL-… se consideran válidas (su número lo genera el sistema).
export function isValidMlOrderNumber(country: Country, raw: string): boolean {
  return mlOrderError(country, raw) === null
}

// Mensaje de error si el número no es válido, o null si está bien.
export function mlOrderError(country: Country, raw: string): string | null {
  const num = (raw ?? '').trim()
  if (num.startsWith('LOCAL-')) return null
  const len = ML_ORDER_LENGTH[country]
  if (!/^\d+$/.test(num)) return 'El número de orden ML debe ser solo dígitos (sin espacios ni otros caracteres).'
  if (num.length !== len) {
    return `El número de orden ML debe tener exactamente ${len} dígitos (tiene ${num.length}). Revisá que no lo hayas pegado dos veces ni quedado incompleto.`
  }
  return null
}
