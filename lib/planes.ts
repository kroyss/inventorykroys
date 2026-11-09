// Planes y precios de El Comerciante Digital (27-10-2026, definidos por el dueño). Única fuente: los muestran
// /precios y el cuadro del inicio. Precio = plan (qué herramientas) × escalón (ventas al mes de todas sus cuentas,
// sin las canceladas); los créditos de IA de bienvenida van por escalón. Fundadores: 30% de por vida sobre su casilla (no se muestra en la página pública).
// Reglas internas (no van en la página): margen del 10% sobre el tope del escalón; cambia de escalón tras 2 meses
// seguidos por encima o por debajo; créditos de IA = UN saldo que no vence (09-11, mig. 156: prueba 500, primer plan según escalón una sola vez, recargas); la cuenta se pausa al día siguiente del vencimiento (aviso 3 días antes; no se pausa si reportó su pago en Mi plan antes de vencer, mig. 141) y los datos se guardan 60 días.

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
      'Radar de Oportunidades Gratis todos los días (PRO los fines de semana, +$6)',
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

/** Escalones por ventas al mes (todas tus cuentas, sin canceladas): precio en USD de cada plan y créditos de IA de
 *  BIENVENIDA. 09-11 (el dueño): los créditos se dan UNA sola vez, con el primer plan que contrata (como el mes de Radar
 *  PRO); no vencen, se acumulan con las recargas y no se vuelven a dar al renovar, cambiar de plan o reactivar. */
export const ESCALONES: { nombre?: string; ventas: string; creditos: number; precios: Record<Plan['id'], number> }[] = [
  { nombre: 'Emprende', ventas: 'Hasta 50', creditos: 500, precios: { esencial: 8, automatizaciones: 10, completo: 14 } },
  { ventas: '51 a 300', creditos: 1000, precios: { esencial: 12, automatizaciones: 15, completo: 20 } },
  { ventas: '301 a 1.000', creditos: 1500, precios: { esencial: 18, automatizaciones: 22, completo: 27 } },
  { ventas: 'Más de 1.000', creditos: 2000, precios: { esencial: 25, automatizaciones: 30, completo: 35 } },
]

export const PRECIO_DESDE = Math.min(...ESCALONES.flatMap(e => Object.values(e.precios)))
export const CUENTAS_INCLUIDAS = 2
export const CUENTA_EXTRA = 3
/** Créditos de la prueba gratis (una vez, al registrarse). */
export const CREDITOS_PRUEBA = 500
/** Paquetes de recarga (09-11): no vencen. 1 crédito = 1 respuesta de la IA (pregunta o mensaje). */
export const RECARGAS_IA = [
  { creditos: 500, precio: 4 },
  { creditos: 2000, precio: 15 },
  { creditos: 5000, precio: 35 },
] as const
/** El paquete chico (el que se nombra en textos cortos). */
export const RECARGA_IA = RECARGAS_IA[0]
export const DESCUENTO_TRIMESTRAL = 10

// ── Asignar planes en Plataforma (01-11-2026, migración 138) ─────────────────────────────────────────────────────
// Módulos que el plan prende o apaga. Lo demás (inventario, ia_automatica, etiquetas…) no lo toca el plan:
// inventario se prende a mano mientras no esté listo para clientes (decisión del dueño, 01-11).
// Radar: solo Automatizaciones y Completo (dueño, 01-11); Esencial no lo trae. radar_dia (solo el día de prueba) se
// apaga siempre al pagar.
export const MODULOS_CONTROLADOS = ['despachos', 'reportador', 'preguntas', 'alertas_stock', 'pagos_me', 'radar', 'radar_dia'] as const
export const MODULOS_PLAN: Record<Plan['id'], readonly string[]> = {
  esencial: ['despachos', 'reportador', 'preguntas', 'alertas_stock'],
  automatizaciones: ['despachos', 'reportador', 'preguntas', 'alertas_stock', 'pagos_me', 'radar'],
  completo: ['despachos', 'reportador', 'preguntas', 'alertas_stock', 'pagos_me', 'radar'],
}
/** ¿El plan trae el Radar? */
export const planConRadar = (plan: string | null | undefined) => !!plan && (MODULOS_PLAN[plan as Plan['id']] ?? []).includes('radar')
export const DESCUENTO_FUNDADOR = 30
export const RADAR_PRO = { precio: 6 }        // Radar PRO los fines de semana, por mes (1er mes gratis al contratar)

/** Monto a cobrar: (precio del escalón + cuentas extra) × meses, con el mayor descuento (Fundador o trimestral, no se suman). */
export function montoPlan(plan: Plan['id'], escalon: number, ciclo: 'mensual' | 'trimestral', fundador: boolean, cuentasExtra = 0) {
  // El descuento (fundador o trimestral, no se suman) es solo del plan: cuentas extra, Radar PRO y recargas van completos.
  const base = ESCALONES[escalon]?.precios[plan] ?? 0
  const extras = Math.max(0, cuentasExtra) * CUENTA_EXTRA
  const meses = ciclo === 'trimestral' ? 3 : 1
  const descuento = Math.max(fundador ? DESCUENTO_FUNDADOR : 0, ciclo === 'trimestral' ? DESCUENTO_TRIMESTRAL : 0)
  return { base, extras, meses, descuento, total: Math.round(base * meses * (100 - descuento) + extras * meses * 100) / 100 }
}

/** Suma meses a una fecha YYYY-MM-DD (el 31 pasa al último día del mes siguiente). */
export function sumarMeses(fecha: string, meses: number) {
  const [a, m, d] = fecha.split('-').map(Number)
  const ultimo = new Date(Date.UTC(a, m - 1 + meses + 1, 0)).getUTCDate()
  return new Date(Date.UTC(a, m - 1 + meses, Math.min(d, ultimo))).toISOString().slice(0, 10)
}
