// Planes y precios de El Comerciante Digital (27-10-2026, definidos por el dueño). Única fuente: los muestran
// /precios y el cuadro del inicio. Precio = plan (qué herramientas) × escalón (ventas al mes de todas sus cuentas,
// sin las canceladas). Fundadores: 30% de por vida sobre su casilla (no se muestra en la página pública).
// Reglas internas (no van en la página): margen del 10% sobre el tope del escalón; cambia de escalón tras 2 meses
// seguidos por encima o por debajo; créditos de IA se renuevan el día 1 y no se acumulan (subir de plan a mitad de
// mes suma la diferencia; bajar aplica el mes siguiente); 5 días de gracia sin pago y datos guardados 60 días.

export interface Plan { id: 'esencial' | 'automatizaciones' | 'completo'; nombre: string; resumen: string; base?: string; incluye: string[]; creditos: number; destacado?: boolean }

export const PLANES: Plan[] = [
  {
    id: 'esencial', nombre: 'Esencial', creditos: 50,
    resumen: 'Todo lo del día a día de tus ventas, en un solo lugar.',
    incluye: [
      'Preguntas con IA y tus propias respuestas',
      'Todos tus mensajes en una sola bandeja',
      'Calificaciones en lote',
      'Alertas de stock y avisos por Telegram',
      'Promociones en lote sin perder el envío gratis',
      'Guías: etiquetas con los productos de cada paquete y manifiestos ZOOM y TEALCA',
      'Reporte de guías: cada comprador recibe su número de guía',
    ],
  },
  {
    id: 'automatizaciones', nombre: 'Automatizaciones', creditos: 100, destacado: true,
    resumen: 'Lo de Esencial, más tus pagos de MercadoEnvíos resueltos solos.',
    base: 'Todo lo de Esencial, más:',
    incluye: [
      'Pagos MercadoEnvíos: pagos y comprobantes llegan solos, listos para verificar',
      'Comprobación con el estado de cuenta de tu banco',
      'Las guías pasan directo a despachos',
    ],
  },
  {
    id: 'completo', nombre: 'Completo', creditos: 200,
    resumen: 'Todo, más el inventario de tu negocio.',
    base: 'Todo lo de Automatizaciones, más:',
    incluye: [
      'Inventario: stock, ventas y compras',
      'Márgenes reales con comisión y envío',
      'Reportes de tu negocio',
    ],
  },
]

/** Escalones por ventas al mes (todas tus cuentas, sin canceladas) y precio en USD de cada plan. */
export const ESCALONES: { nombre?: string; ventas: string; precios: Record<Plan['id'], number> }[] = [
  { nombre: 'Emprende', ventas: 'Hasta 50', precios: { esencial: 8, automatizaciones: 10, completo: 14 } },
  { ventas: '51 a 300', precios: { esencial: 12, automatizaciones: 15, completo: 20 } },
  { ventas: '301 a 1.000', precios: { esencial: 18, automatizaciones: 22, completo: 27 } },
  { ventas: 'Más de 1.000', precios: { esencial: 25, automatizaciones: 30, completo: 35 } },
]

export const PRECIO_DESDE = Math.min(...ESCALONES.flatMap(e => Object.values(e.precios)))
export const CUENTAS_INCLUIDAS = 2
export const CUENTA_EXTRA = 3
export const RECARGA_IA = { creditos: 100, precio: 3 }
export const DESCUENTO_TRIMESTRAL = 10
export const DESCUENTO_ANUAL = 20
