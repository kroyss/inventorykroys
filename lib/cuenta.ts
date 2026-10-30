// Estado de la cuenta de cada organización (migración 045). Sin imports de servidor: lo usan
// también las pantallas de Plataforma.

export type EstadoCuenta = 'propietario' | 'prueba' | 'activo' | 'vencido'

/** Días de prueba gratis según el tipo de alta. */
export const DIAS_PRUEBA = { fundador: 30, normal: 15 } as const

/** La prueba arranca al conectar la primera cuenta de ML (migración 067), pero a más tardar
 *  estos días después de creada la cuenta (2026-10-08: 7 → 5, Fundadores Ronda 2: creada el 13 → arranca el 18). */
export const DIAS_ESPERA_CONEXION = 5

/** Condición SQL (alias `o` = organizaciones): ¿sus usuarios pueden entrar hoy? Una prueba con la
 *  fecha ya pasada (hora Caracas) cuenta como vencida. */
export const SQL_CUENTA_HABILITADA = `(o.estado IN ('propietario', 'activo')
  OR (o.estado = 'prueba' AND (o.prueba_hasta IS NULL OR o.prueba_hasta >= (NOW() AT TIME ZONE 'America/Caracas')::date)))`

/** Días que se siguen trayendo los datos de MercadoLibre de una prueba vencida (margen para que pague
 *  sin notar nada). Pasado eso, el cron deja de sincronizarla; al reactivarla se retoma sola. */
export const DIAS_SINCRONIZA_VENCIDA = 30

/** Empresa inactiva = ningún usuario suyo usó el sistema en estos días: el cron la sincroniza cada
 *  MINUTOS_INACTIVA minutos en vez de cada minuto. Vuelve sola a cada minuto cuando alguien entra. */
export const DIAS_INACTIVA = 7
export const MINUTOS_INACTIVA = 30

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
/** Error de authorize: la cuenta es solo del Radar (se registró desde el Radar, migración 133) y no tiene empresa. */
export const SOLO_RADAR = 'SOLO_RADAR'
export const RADAR_URL = 'https://radar.elcomerciantedigital.com'
/** Registro desde el Radar (/registro?para=radar): entra los días del grupo de entrada que se arme en el Radar.
 *  Cambiar este texto cuando cambie el día de prueba. */
export const RADAR_PRUEBA_DIA = 'el sábado 31 de octubre'
/** Contacto para reactivar una cuenta pausada (19-10). */
export const TELEGRAM_SOPORTE = 'https://t.me/elcomerciantedigital'
/** Qué decirle a quien intenta entrar con la cuenta pausada, según el motivo (migración 105). */
export function textoCuentaPausada(motivo: string, fecha?: string) {
  if (motivo === 'corte_fundadores') return 'Tu cupo de Fundador se liberó porque no conectaste tu MercadoLibre a tiempo. Si todavía te interesa, escríbenos para revisar tu caso.'
  if (motivo === 'plan') return `Tu plan venció${fecha ? ` el ${fecha}` : ''}. Renuévalo para seguir, escríbenos.`
  return 'Tu prueba gratis terminó. Para seguir usando el sistema, escríbenos para revisar tu caso.'
}
