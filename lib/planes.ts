// Planes y precios de El Comerciante Digital (27-10-2026, definidos por el dueño). Única fuente: los muestran
// /precios y el cuadro del inicio. Precio = plan (qué herramientas) × escalón (ventas al mes de todas sus cuentas,
// sin las canceladas); los créditos de IA van por escalón. Fundadores: 30% de por vida sobre su casilla (no se muestra en la página pública).
// Reglas internas (no van en la página): margen del 10% sobre el tope del escalón; cambia de escalón tras 2 meses
// seguidos por encima o por debajo; créditos de IA se renuevan el día 1 y no se acumulan (subir de plan a mitad de
// mes suma la diferencia; bajar aplica el mes siguiente); 5 días de gracia sin pago y datos guardados 60 días.

export interface Plan { id: 'esencial' | 'automatizaciones' | 'completo'; nombre: string; resumen: string; base?: string; incluye: string[]; destacado?: boolean }

export const PLANES: Plan[] = [
  {
    id: 'esencial', nombre: 'Esencial',
    resumen: 'Todo lo del día a día de tus ventas, en un solo lugar.',
    incluye: [
      'Preguntas con IA y tus propias respuestas',
      'Todos tus mensajes en una sola bandeja',
      'Calificaciones en lote',
      'Alertas de stock y avisos por Telegram',
      'Guías: etiquetas con los productos de cada paquete y manifiestos ZOOM y TEALCA',
      'Reporte de guías: cada comprador recibe su número de guía',
    ],
  },
  {
    id: 'automatizaciones', nombre: 'Automatizaciones', destacado: true,
    resumen: 'Lo de Esencial, más tus pagos de MercadoEnvíos resueltos solos.',
    base: 'Todo lo de Esencial, más:',
    incluye: [
      'Pagos MercadoEnvíos: pagos y comprobantes llegan solos, listos para verificar',
      'Comprobación con el estado de cuenta de tu banco',
      'Las guías pasan directo a despachos',
    ],
  },
  {
    id: 'completo', nombre: 'Completo',
    resumen: 'Todo, más inventario, promociones y tus publicaciones vinculadas.',
    base: 'Todo lo de Automatizaciones, más:',
    incluye: [
      'Inventario: stock, ventas y compras',
      'Publicaciones de MercadoLibre vinculadas a tus productos',
      'Pesos y precios: envío gratis y márgenes reales con comisión y envío',
      'Promociones en lote sin perder el envío gratis',
      'Reportes de tu negocio',
    ],
  },
]

/** Escalones por ventas al mes (todas tus cuentas, sin canceladas): precio en USD de cada plan y créditos de IA al mes.
 *  Los créditos van por escalón, no por plan (27-10): la IA se gasta respondiendo, y eso crece con las ventas. */
export const ESCALONES: { nombre?: string; ventas: string; creditos: number; precios: Record<Plan['id'], number> }[] = [
  { nombre: 'Emprende', ventas: 'Hasta 50', creditos: 50, precios: { esencial: 8, automatizaciones: 10, completo: 14 } },
  { ventas: '51 a 300', creditos: 80, precios: { esencial: 12, automatizaciones: 15, completo: 20 } },
  { ventas: '301 a 1.000', creditos: 100, precios: { esencial: 18, automatizaciones: 22, completo: 27 } },
  { ventas: 'Más de 1.000', creditos: 150, precios: { esencial: 25, automatizaciones: 30, completo: 35 } },
]

export const PRECIO_DESDE = Math.min(...ESCALONES.flatMap(e => Object.values(e.precios)))
export const CUENTAS_INCLUIDAS = 2
export const CUENTA_EXTRA = 3
export const RECARGA_IA = { creditos: 100, precio: 4 }
export const DESCUENTO_TRIMESTRAL = 10
export const DESCUENTO_ANUAL = 20
