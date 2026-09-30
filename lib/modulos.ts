// Módulos por empresa (empresas.modulos). El núcleo (Inicio, Ventas, Inventario, Compras,
// Productos, Reportes, Ajustes, Usuarios) lo tienen todas; estos se prenden por empresa.
// Un módulo apagado no aparece en el menú, su página redirige y su API responde 403.
export const MODULOS = {
  despachos:  'Despachos (etiquetas Zoom/Tealca 4 por hoja y manifiesto)',
  reportador: 'Reportador (mensaje de guía al comprador)',
  facturas:   'Facturas',
  finanzas:   'Finanzas',
  bonos:      'Bonos del vendedor',
  preguntas:  'Preguntas de MercadoLibre con IA',
} as const

export type Modulo = keyof typeof MODULOS

// Página → módulo que la habilita (lo que no está aquí es del núcleo).
export const MODULO_DE_RUTA: Record<string, Modulo> = {
  '/despachos': 'despachos',
  '/reportador': 'reportador',
  '/facturas':  'facturas',
  '/finanzas':  'finanzas',
  '/preguntas': 'preguntas',
}

export function tieneModulo(user: { modulos?: string[] } | null | undefined, modulo: Modulo) {
  return !!user?.modulos?.includes(modulo)
}

/** ¿La ruta del menú está habilitada para estos módulos? */
export function rutaHabilitada(href: string, modulos: string[]) {
  const m = MODULO_DE_RUTA[href]
  return !m || modulos.includes(m)
}

/** Facturas: solo Venezuela (factura fiscal en Bs) y con el módulo prendido. */
export function facturasHabilitadas(user: { country?: string; modulos?: string[] }) {
  return user.country === 'VE' && tieneModulo(user, 'facturas')
}
