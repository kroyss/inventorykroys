// Productos de El Comerciante Digital a los que puede entrar una cuenta (users.productos).
export const PRODUCTOS = {
  inventario: 'Inventario (y automatizaciones de su empresa)',
  radar:      'Radar de Oportunidades',
} as const

export type Producto = keyof typeof PRODUCTOS
