// Estado de la cuenta de cada organización (migración 045). Sin imports de servidor: lo usan
// también las pantallas de Plataforma.

export type EstadoCuenta = 'propietario' | 'prueba' | 'activo' | 'vencido'

/** Días de prueba gratis según el tipo de alta. */
export const DIAS_PRUEBA = { fundador: 30, normal: 15 } as const

/** Condición SQL (alias `o` = organizaciones): ¿sus usuarios pueden entrar hoy? Una prueba con la
 *  fecha ya pasada (hora Caracas) cuenta como vencida. */
export const SQL_CUENTA_HABILITADA = `(o.estado IN ('propietario', 'activo')
  OR (o.estado = 'prueba' AND (o.prueba_hasta IS NULL OR o.prueba_hasta >= (NOW() AT TIME ZONE 'America/Caracas')::date)))`

/** El estado que vale hoy: una prueba vencida se muestra como "vencido". */
export function estadoEfectivo(estado: EstadoCuenta, pruebaHasta: string | null, hoy: string): EstadoCuenta {
  return estado === 'prueba' && pruebaHasta != null && pruebaHasta < hoy ? 'vencido' : estado
}

export const ETIQUETA_ESTADO: Record<EstadoCuenta, string> = {
  propietario: 'Propietario', prueba: 'En prueba', activo: 'Activo', vencido: 'Vencido',
}

/** Mensaje del login (y error que lanza authorize) cuando la cuenta está vencida. */
export const CUENTA_VENCIDA = 'CUENTA_VENCIDA'
