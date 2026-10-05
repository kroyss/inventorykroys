// Estado de la cuenta de cada organización (migración 045). Sin imports de servidor: lo usan
// también las pantallas de Plataforma.

export type EstadoCuenta = 'propietario' | 'prueba' | 'activo' | 'vencido'

/** Días de prueba gratis según el tipo de alta. */
export const DIAS_PRUEBA = { fundador: 30, normal: 15 } as const

/** La prueba arranca al conectar la primera cuenta de ML (migración 067), pero a más tardar
 *  estos días después de creada la cuenta. */
export const DIAS_ESPERA_CONEXION = 7

/** Condición SQL (alias `o` = organizaciones): ¿sus usuarios pueden entrar hoy? Una prueba con la
 *  fecha ya pasada (hora Caracas) cuenta como vencida. */
export const SQL_CUENTA_HABILITADA = `(o.estado IN ('propietario', 'activo')
  OR (o.estado = 'prueba' AND (o.prueba_hasta IS NULL OR o.prueba_hasta >= (NOW() AT TIME ZONE 'America/Caracas')::date)))`

/** Días que se siguen trayendo los datos de MercadoLibre de una prueba vencida (margen para que pague
 *  sin notar nada). Pasado eso, el cron deja de sincronizarla; al reactivarla se retoma sola. */
export const DIAS_SINCRONIZA_VENCIDA = 30

/** Condición SQL (alias `o`): ¿el cron sigue trayendo sus datos de MercadoLibre? Habilitada, o prueba
 *  vencida hace menos de DIAS_SINCRONIZA_VENCIDA días. "Vencido" puesto a mano corta el mismo día. */
export const SQL_CUENTA_SINCRONIZA = `(${SQL_CUENTA_HABILITADA}
  OR (o.estado = 'prueba' AND o.prueba_hasta >= (NOW() AT TIME ZONE 'America/Caracas')::date - ${DIAS_SINCRONIZA_VENCIDA}))`

/** El estado que vale hoy: una prueba vencida se muestra como "vencido". */
export function estadoEfectivo(estado: EstadoCuenta, pruebaHasta: string | null, hoy: string): EstadoCuenta {
  return estado === 'prueba' && pruebaHasta != null && pruebaHasta < hoy ? 'vencido' : estado
}

export const ETIQUETA_ESTADO: Record<EstadoCuenta, string> = {
  propietario: 'Propietario', prueba: 'En prueba', activo: 'Activo', vencido: 'Vencido',
}

/** Mensaje del login (y error que lanza authorize) cuando la cuenta está vencida. */
export const CUENTA_VENCIDA = 'CUENTA_VENCIDA'
