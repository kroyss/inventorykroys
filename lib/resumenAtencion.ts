import type { Pool } from 'pg'

// Resumen de la atención (Fase 5, ideas de Mercasist, 2026-11-07): cuántas preguntas llegaron, cuántas se
// respondieron (y cuántas sola la IA), en cuánto tiempo, y cuántas ventas hubo, comparado con el período
// anterior del mismo largo. Lo usan el Inicio de Automatizaciones y el resumen de los lunes por Telegram.
// Solo cuenta: no trae datos de compradores.

export const PERIODOS = [7, 30, 90] as const
export type Periodo = typeof PERIODOS[number]

export interface CifrasAtencion {
  preguntas: number          // recibidas en el período
  respondidas: number        // de esas, las que ya tienen respuesta
  porSistema: number         // respondidas desde el sistema (no desde la web/app de ML)
  porIA: number              // publicadas solas por la IA automática
  mediana: number | null     // minutos: la mitad se respondió en menos de esto
  rapidas: number            // respondidas en menos de 1 hora
  mensajes: number           // respuestas mandadas desde Mensajes
  ventas: number             // ventas de ML no canceladas
}
export interface ResumenAtencion { dias: number; actual: CifrasAtencion; anterior: CifrasAtencion }

async function cifras(db: Pool, desde: number, hasta: number): Promise<CifrasAtencion> {
  // Ventana [NOW() - desde días, NOW() - hasta días)
  const { rows: [q] } = await db.query(
    `SELECT COUNT(*)::int AS preguntas, COUNT(respuesta_fecha)::int AS respondidas,
            COUNT(*) FILTER (WHERE respondida_por IS NOT NULL)::int AS por_sistema,
            COUNT(*) FILTER (WHERE respuesta_fecha IS NOT NULL AND respuesta_fecha - fecha < INTERVAL '1 hour')::int AS rapidas,
            percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM respuesta_fecha - fecha) / 60)
              FILTER (WHERE respuesta_fecha IS NOT NULL AND respuesta_fecha >= fecha) AS mediana
     FROM ml_preguntas
     WHERE fecha >= NOW() - make_interval(days => $1) AND fecha < NOW() - make_interval(days => $2)`, [desde, hasta])
  const { rows: [o] } = await db.query(
    `SELECT COUNT(*) FILTER (WHERE modulo = 'preguntas' AND fuente = 'automatica')::int AS por_ia,
            COUNT(*) FILTER (WHERE modulo = 'mensajes')::int AS mensajes
     FROM respuestas_origen
     WHERE fecha >= NOW() - make_interval(days => $1) AND fecha < NOW() - make_interval(days => $2)`, [desde, hasta])
  const { rows: [v] } = await db.query(
    `SELECT COUNT(*)::int AS ventas FROM ml_ordenes
     WHERE COALESCE(estado, '') <> 'cancelled'
       AND fecha >= NOW() - make_interval(days => $1) AND fecha < NOW() - make_interval(days => $2)`, [desde, hasta])
  return {
    preguntas: q.preguntas, respondidas: q.respondidas, porSistema: q.por_sistema, rapidas: q.rapidas,
    mediana: q.mediana == null ? null : Math.round(Number(q.mediana)),
    porIA: o.por_ia, mensajes: o.mensajes, ventas: v.ventas,
  }
}

/** Los últimos `dias` contra los `dias` anteriores. Las ventas de ML se guardan ~120 días: con 90 alcanza. */
export async function resumenAtencion(db: Pool, dias: number): Promise<ResumenAtencion> {
  const [actual, anterior] = await Promise.all([cifras(db, dias, 0), cifras(db, dias * 2, dias)])
  return { dias, actual, anterior }
}

/** "12 min" · "1,5 h" · "2 días" */
export function textoMinutos(m: number | null) {
  if (m == null) return '—'
  if (m < 60) return `${m} min`
  if (m < 48 * 60) return `${(Math.round(m / 6) / 10).toLocaleString('es-VE')} h`
  return `${Math.round(m / 1440)} días`
}

/** Cambio en % (null si antes era 0: no se puede comparar). */
export function cambio(ahora: number, antes: number) {
  if (!antes) return null
  return Math.round((ahora - antes) / antes * 100)
}
