// Colores de la ganancia neta (14-11-2026, el dueño): 3 niveles configurables por empresa en Productos → Costos ML.
//   Sana      ≥ margen_sano      (verde,   por defecto 20 %)
//   Ajustada  ≥ margen_ajustado  (naranja, por defecto 0 %)
//   Pérdida   por debajo         (rojo)
// Se miden sobre la GANANCIA NETA SOBRE LA VENTA (lo que queda después de comisión, envío, cambiario y costo),
// no sobre el % de ganancia del producto (markup). Una sola fuente para ficha, catálogo, cascada y simuladores.

export interface Umbrales { sano: number; ajustado: number }
export type Nivel = 'sano' | 'ajustado' | 'perdida'

export const UMBRALES_DEFECTO: Umbrales = { sano: 20, ajustado: 0 }

export function umbralesDe(ml: Record<string, string> | null | undefined): Umbrales {
  const n = (k: string, d: number) => { const v = parseFloat(ml?.[k] ?? ''); return isNaN(v) ? d : v }
  const sano = n('margen_sano', UMBRALES_DEFECTO.sano)
  const ajustado = Math.min(n('margen_ajustado', UMBRALES_DEFECTO.ajustado), sano)
  return { sano, ajustado }
}

export const nivelDe = (m: number, u: Umbrales): Nivel => m >= u.sano ? 'sano' : m >= u.ajustado ? 'ajustado' : 'perdida'

export const NIVEL: Record<Nivel, { nombre: string; icono: string; texto: string; fondo: string; barra: string }> = {
  sano:     { nombre: 'Sana',     icono: '✅', texto: 'text-emerald-600', fondo: 'bg-emerald-50 border-emerald-300', barra: 'accent-emerald-600' },
  ajustado: { nombre: 'Ajustada', icono: '⚠️', texto: 'text-orange-600',  fondo: 'bg-orange-50 border-orange-300',   barra: 'accent-orange-500' },
  perdida:  { nombre: 'Pérdida',  icono: '🔴', texto: 'text-red-600',     fondo: 'bg-red-50 border-red-300',         barra: 'accent-red-600' },
}

export const colorMargen = (m: number, u: Umbrales) => NIVEL[nivelDe(m, u)].texto
