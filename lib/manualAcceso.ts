import { tieneModulo } from '@/lib/modulos'

/** 18-11: el Manual de Automatizaciones se ve con cualquiera de sus módulos (sirve en cliente y servidor). */
export const conAutomatizaciones = (u: { modulos?: string[] } | null | undefined) =>
  (['preguntas', 'despachos', 'reportador', 'pagos_me', 'alertas_stock'] as const).some(m => tieneModulo(u, m))
