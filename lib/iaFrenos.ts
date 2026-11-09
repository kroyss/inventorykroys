// FRENOS DE LA IA AUTOMÁTICA (07-11-2026, Fase 2 de docs/analisis-mercasist.md, ideas de Mercasist ajustadas):
//   - HORARIO: días y horas en que la IA responde sola (Preguntas y Mensajes). Fuera de eso escribe el borrador y lo deja
//     para una persona. De fábrica SIN horario (responde siempre, como antes).
//   - TOPE POR COMPRADOR: máximo de respuestas automáticas de la IA a un mismo comprador en 24 h (de fábrica 3). La
//     siguiente queda para una persona: un insistente no gasta créditos ni arma una conversación rara.
//   - FRASE DE ESCAPE (solo Mensajes): cuando la IA no la manda sola, puede mandar un acuse corto ("Recibido, ya te
//     confirmamos") y la conversación sigue en «Por atender» para el equipo. En Preguntas NO: ML acepta una sola respuesta
//     por pregunta y la buena ya no podría ir ahí. Apagada de fábrica.
//   - RESPONDER TODO (08-11, pedido del dueño, opcional y apagado): en Preguntas, lo que la IA deja para revisar se
//     contesta con una frase propia (ej. "Sí, disponible. Escríbenos por mensaje tras la compra…"). La pregunta queda
//     RESPONDIDA con esa frase (ML acepta una sola respuesta): sirve para no dejar preguntas sin contestar de noche.
//     No se usa si el freno fue el tope por comprador ni si la publicación está pausada.
// Solo frenan en modo REAL (en modo prueba se mide la decisión de la IA sin ellos). Se guarda en app_settings.ia_frenos.
import type { Pool } from 'pg'
import { COUNTRY_TZ } from '@/lib/tz'

export const CLAVE_FRENOS = 'ia_frenos'
export const TOPE_DEFAULT = 3

export interface HorarioIA { dias: number[]; desde: string; hasta: string }   // dias: 0 = domingo … 6 = sábado; "HH:MM"
export interface FrenosIA { horario: HorarioIA | null; tope: number; escape: string | null; escapePreguntas: string | null }

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

export function normalizarFrenos(v: unknown): FrenosIA {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  const h = o.horario as Record<string, unknown> | null | undefined
  const dias = Array.isArray(h?.dias) ? [...new Set((h!.dias as unknown[]).map(Number).filter(d => Number.isInteger(d) && d >= 0 && d <= 6))].sort() : []
  const horario = h && dias.length && HHMM.test(String(h.desde)) && HHMM.test(String(h.hasta)) && h.desde !== h.hasta
    ? { dias, desde: String(h.desde), hasta: String(h.hasta) } : null
  const tope = Number.isInteger(o.tope) && (o.tope as number) >= 0 && (o.tope as number) <= 50 ? o.tope as number : TOPE_DEFAULT
  const escape = typeof o.escape === 'string' && o.escape.trim() ? o.escape.trim().slice(0, 200) : null
  const escapePreguntas = typeof o.escapePreguntas === 'string' && o.escapePreguntas.trim() ? o.escapePreguntas.trim().slice(0, 350) : null
  return { horario, tope, escape, escapePreguntas }
}

// 09-11 (el dueño, activación para clientes): al ENCENDER la IA automática por primera vez quedan unos frenos de fábrica
// para que el cliente no tenga que configurar nada: tope de 3 por comprador en 24 h y, en Mensajes, un acuse corto
// cuando la IA deja el mensaje para una persona. Sin horario: responde a toda hora (de noche es cuando más sirve).
// Si la empresa ya tiene sus frenos guardados no se tocan. Se editan en Mi IA → Frenos.
export const FRENOS_FABRICA: FrenosIA = {
  horario: null, tope: TOPE_DEFAULT,
  escape: '¡Hola! Recibimos tu mensaje, en breve te respondemos por aquí.', escapePreguntas: null,
}
export async function frenosDeFabrica(db: Pick<Pool, 'query'>) {
  await db.query(
    `INSERT INTO app_settings (key, value) VALUES ($1, $2) ON CONFLICT (empresa_id, key) DO NOTHING`,
    [CLAVE_FRENOS, JSON.stringify(FRENOS_FABRICA)])
}

export async function leerFrenos(db: Pick<Pool, 'query'>): Promise<FrenosIA> {
  const { rows: [r] } = await db.query(`SELECT value FROM app_settings WHERE key = $1`, [CLAVE_FRENOS])
  try { return normalizarFrenos(JSON.parse(r?.value ?? '{}')) } catch { return normalizarFrenos({}) }
}

/** ¿Ahora está dentro del horario? Sin horario = siempre. Si "hasta" es menor que "desde" cruza la medianoche
 *  (19:00 → 08:00): la madrugada cuenta como parte del día en que empezó. */
export function dentroDelHorario(h: HorarioIA | null, country: string, ahora = new Date()): boolean {
  if (!h) return true
  const tz = COUNTRY_TZ[country as 'VE' | 'CO'] ?? COUNTRY_TZ.VE
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(ahora).map(x => [x.type, x.value]))
  const dia = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday)
  const hm = `${p.hour}:${p.minute}`
  if (h.desde < h.hasta) return h.dias.includes(dia) && hm >= h.desde && hm < h.hasta
  if (hm >= h.desde) return h.dias.includes(dia)
  if (hm < h.hasta) return h.dias.includes((dia + 6) % 7)
  return false
}

export const MOTIVO_TOPE = 'Tope por comprador'
export const NOMBRE_DIA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

/** Motivos de los frenos para una respuesta automática (vacío = puede salir). */
export async function motivosFrenos(db: Pick<Pool, 'query'>, f: FrenosIA, country: string,
  modulo: 'preguntas' | 'mensajes', compradorId: string | number | null): Promise<string[]> {
  const m: string[] = []
  if (!dentroDelHorario(f.horario, country)) m.push('Fuera del horario de la IA automática')
  if (compradorId != null && f.tope >= 0) {
    const { rows: [r] } = modulo === 'preguntas'
      ? await db.query(
          `SELECT COUNT(*)::int AS n FROM ml_preguntas
           WHERE comprador_id::text = $1::text AND (ia_auto->>'publicada' = 'true' OR ia_auto->>'escape' = 'true')
             AND COALESCE(respuesta_fecha, (ia_auto->>'fecha')::timestamptz) > NOW() - INTERVAL '24 hours'`, [String(compradorId)])
      : await db.query(
          `SELECT COUNT(*)::int AS n FROM ml_mensajes_ia i JOIN ml_conversaciones c ON c.pack_id = i.pack_id
           WHERE c.comprador_id::text = $1::text
             AND (i.enviada_at > NOW() - INTERVAL '24 hours' OR i.escape_at > NOW() - INTERVAL '24 hours')`, [String(compradorId)])
    if ((r?.n ?? 0) >= f.tope) m.push(`${MOTIVO_TOPE}: este comprador ya recibió ${r.n} respuesta${r.n === 1 ? '' : 's'} automática${r.n === 1 ? '' : 's'} en 24 h`)
  }
  return m
}
