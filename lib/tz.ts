// Fechas "de negocio" (hoy, mes actual) deben calcularse en la zona horaria del
// país, no en la del contenedor ni en UTC. Las DBs ya tienen su timezone seteado
// (ALTER DATABASE ... SET timezone), así que el SQL (NOW(), CURRENT_DATE) ya es
// correcto por país; esto alinea el lado JS de los route handlers.
//
// OJO: Date#toISOString() SIEMPRE devuelve UTC, ignorando el TZ del contenedor.
// Por eso no alcanza con poner TZ=America/Caracas en el contenedor: hay que
// calcular la fecha explícitamente con estas funciones (Intl con timeZone).

export const COUNTRY_TZ: Record<'VE' | 'CO', string> = {
  VE: 'America/Caracas',
  CO: 'America/Bogota',
}

// Zona por defecto del negocio. Finanzas es un módulo global anclado a VE.
export const DEFAULT_TZ = 'America/Caracas'

// Año / mes (1-12) / día actuales en la zona indicada.
export function nowParts(tz: string = DEFAULT_TZ): { year: number; month: number; day: number } {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  })
  const p: Record<string, string> = {}
  for (const part of fmt.formatToParts(new Date())) p[part.type] = part.value
  return { year: +p.year, month: +p.month, day: +p.day }
}

// 'YYYY-MM' del mes actual en la zona indicada.
export function currentYearMonth(tz: string = DEFAULT_TZ): string {
  const { year, month } = nowParts(tz)
  return `${year}-${String(month).padStart(2, '0')}`
}

// 'YYYY-MM-DD' de hoy en la zona indicada.
export function currentDate(tz: string = DEFAULT_TZ): string {
  const { year, month, day } = nowParts(tz)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}
