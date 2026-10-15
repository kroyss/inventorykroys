// Espacios de El Comerciante Digital: cada uno con su propio menú, para no mezclar todo.
//   Inventario        → el sistema de gestión (ventas, inventario, compras, productos…)
//   Automatizaciones  → herramientas sobre MercadoLibre (despachos, Reportador, y lo que venga)
//   Radar             → otra app (radar.*), mismo usuario
// El espacio lo decide la ruta; la cuenta, la empresa y los datos son los mismos.
export type Espacio = 'inventario' | 'automatizaciones'

const RUTAS_AUTOMATIZACIONES = ['/automatizaciones', '/despachos', '/reportador', '/preguntas', '/mensajes', '/calificaciones', '/alertas-stock', '/cuentas-ml', '/mis-avisos']

export function espacioDe(pathname: string): Espacio {
  return RUTAS_AUTOMATIZACIONES.some(r => pathname === r || pathname.startsWith(r + '/'))
    ? 'automatizaciones'
    : 'inventario'
}

/** El espacio en que se está: la empresa sin el módulo inventario vive siempre en
 *  Automatizaciones (también en Usuarios, Aprendizaje…, que no son de ningún espacio). */
export function espacioActual(pathname: string, modulos: string[]): Espacio {
  if (!modulos.includes('inventario')) return 'automatizaciones'
  // Pagos ME es de Automatizaciones donde Despachos trabaja con las ventas de ML (inventario simple);
  // con ventas cargadas (SolucionesMC) sigue en Inventario, al lado de Ventas.
  if ((pathname === '/pagos-me' || pathname.startsWith('/pagos-me/')) && !modulos.includes('despachos_ventas')) return 'automatizaciones'
  return espacioDe(pathname)
}

// Módulos que forman el espacio Automatizaciones (si la empresa no tiene ninguno, el
// espacio no aparece).
export const MODULOS_AUTOMATIZACIONES = ['despachos', 'reportador', 'preguntas'] as const

// Dirección del Radar (tiempo de ejecución, del lado del servidor).
export function radarUrl() {
  return process.env.RADAR_URL ?? 'https://radar.elcomerciantedigital.com'
}
