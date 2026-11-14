import { currentDate } from '@/lib/tz'

// Inicio (14-11, el dueño: "unir Inicio y Resumen"): los botones Hoy / Mes / Trim. / Año / fechas del gráfico mandan
// sobre TODO el Inicio. Esto convierte esa elección en fechas (YYYY-MM-DD, del país, ambas incluidas) y el período
// con el que se compara: Hoy → ayer · Mes → el mes anterior hasta el mismo día · Trim. → los 3 meses anteriores ·
// Año → el año anterior hasta el mismo día · fechas → los mismos días justo antes.
export type PeriodoInicio = 'today' | 'month' | 'quarter' | 'year' | 'custom'
export const PERIODOS_INICIO: PeriodoInicio[] = ['today', 'month', 'quarter', 'year', 'custom']
export interface RangoInicio { periodo: PeriodoInicio; desde: string; hasta: string; antesDesde: string; antesHasta: string }

const FECHA = /^\d{4}-\d{2}-\d{2}$/

/** Mueve una fecha N meses (si el día no existe en ese mes, queda en el último) y después N días. */
export function moverFecha(f: string, meses: number, dias = 0) {
  const [y, m, d] = f.split('-').map(Number)
  const base = new Date(Date.UTC(y, m - 1 + meses, 1))
  const ultimo = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate()
  return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), Math.min(d, ultimo) + dias)).toISOString().slice(0, 10)
}

export function rangoInicio(periodo: string | null, from: string | null, to: string | null, tz: string): RangoInicio {
  const hoy = currentDate(tz)
  const mes = hoy.slice(0, 8) + '01'
  switch (periodo) {
    case 'today': return { periodo, desde: hoy, hasta: hoy, antesDesde: moverFecha(hoy, 0, -1), antesHasta: moverFecha(hoy, 0, -1) }
    case 'quarter': {
      const desde = moverFecha(mes, -2)
      return { periodo, desde, hasta: hoy, antesDesde: moverFecha(desde, -3), antesHasta: moverFecha(hoy, -3) }
    }
    case 'year': {
      const desde = hoy.slice(0, 4) + '-01-01'
      return { periodo, desde, hasta: hoy, antesDesde: moverFecha(desde, -12), antesHasta: moverFecha(hoy, -12) }
    }
    case 'custom':
      if (from && to && FECHA.test(from) && FECHA.test(to) && from <= to) {
        const largo = Math.round((Date.parse(to) - Date.parse(from)) / 864e5) + 1
        return { periodo, desde: from, hasta: to, antesDesde: moverFecha(from, 0, -largo), antesHasta: moverFecha(from, 0, -1) }
      }
  }
  return { periodo: 'month', desde: mes, hasta: hoy, antesDesde: moverFecha(mes, -1), antesHasta: moverFecha(hoy, -1) }
}

/** "1–14 oct" · "3 nov" · "1 ene 2025 – 14 nov 2025" (para «contra …»). */
export function textoRango(desde: string, hasta: string) {
  const f = (s: string, conAnio: boolean) => {
    const [y, m, d] = s.split('-').map(Number)
    const t = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('es-VE', { day: 'numeric', month: 'short', timeZone: 'UTC' }).replace('.', '')
    return conAnio ? `${t} ${y}` : t
  }
  const otroAnio = desde.slice(0, 4) !== hasta.slice(0, 4) || desde.slice(0, 4) !== String(new Date().getFullYear())
  if (desde === hasta) return f(desde, otroAnio)
  if (desde.slice(0, 7) === hasta.slice(0, 7) && !otroAnio) return `${Number(desde.slice(8))}–${f(hasta, false)}`
  return `${f(desde, otroAnio)} – ${f(hasta, otroAnio)}`
}
