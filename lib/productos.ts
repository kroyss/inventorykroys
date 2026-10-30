// Productos de El Comerciante Digital a los que puede entrar una cuenta (users.productos).
// 'despegue' (21-10) no es una app: marca a quien está en el Programa Despegue. El Radar lo mete solo en el grupo
// Despegue vigente la primera vez que entra (solo los domingos del programa; AnalisisMercadoML, migración 033), y
// siempre va con 'radar' (ver conProductosImplicitos).
export const PRODUCTOS = {
  inventario: 'Inventario (y automatizaciones de su empresa)',
  radar:      'Radar de Oportunidades',
  despegue:   'Programa Despegue (Radar solo los domingos del programa)',
} as const

export type Producto = keyof typeof PRODUCTOS

/** Despegue sin Radar no tiene sentido: el bono es el Radar. Se agrega solo. */
export function conProductosImplicitos<T extends string>(productos: T[]): T[] {
  return productos.includes('despegue' as T) && !productos.includes('radar' as T) ? [...productos, 'radar' as T] : productos
}
