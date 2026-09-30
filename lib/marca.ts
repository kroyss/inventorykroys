// Marca de la instalación. La MISMA app y la MISMA base se sirven con dos marcas, una por
// contenedor (variable MARCA, se lee en tiempo de ejecución, no al compilar):
//   app.elcomerciantedigital.com  → ecd (por defecto; Syncsora ya no se usa)
//   MARCA=syncsora                → la marca vieja, solo si se pide explícitamente
// Solo cambia lo que se ve (nombre, logo, íconos); los datos y permisos son los mismos.
export interface Marca {
  id: 'syncsora' | 'ecd'
  nombre: string
  lema: string
  logo: string
  logoRedondo: boolean
  favicon: string
  appleIcon: string
}

const MARCAS: Record<Marca['id'], Marca> = {
  syncsora: {
    id: 'syncsora',
    nombre: 'Syncsora Inventory',
    lema: 'Control de inventario',
    logo: '/logo.jpg?v=2',
    logoRedondo: false,
    favicon: '/favicon-32x32.png',
    appleIcon: '/apple-touch-icon.png',
  },
  ecd: {
    id: 'ecd',
    nombre: 'El Comerciante Digital',
    lema: 'Inventario, ventas y despachos para vendedores de MercadoLibre',
    logo: '/marca/ecd.png',
    logoRedondo: true,
    favicon: '/marca/ecd-favicon-32x32.png',
    appleIcon: '/marca/ecd-apple-touch-icon.png',
  },
}

export function marca(): Marca {
  return MARCAS[process.env.MARCA === 'syncsora' ? 'syncsora' : 'ecd']
}
