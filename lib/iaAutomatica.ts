// Respuesta automática con IA (01-11-2026, plan del dueño tras la evaluación de octubre: 37 de 38 bien en confianza alta).
// El cron, después de las respuestas rápidas automáticas, le pide a la IA cada pregunta NUEVA y decide:
//   - "sola": confianza alta + verificador OK + no dice que no hay + no manda a otra publicación + publicación activa
//     + el texto no tiene nada que MercadoLibre borre;
//   - "revisar": todo lo demás, con el motivo. La respuesta queda escrita como borrador para que una persona la mande.
// Modos (app_settings.preguntas_ia_auto): apagado · sombra (decide pero NO publica: para medir, el vendedor marca cada una
// bien o mal) · real (publica las "sola"). La pausa de las respuestas automáticas (preguntas_auto_pausa) la frena igual.
// Cada pregunta procesada usa 1 crédito de IA (ia_uso.modulo = 'preguntas'); sin créditos no procesa.
import type { Pool } from 'pg'
import { armarContexto, pedirBorrador, iaConfigurada } from '@/lib/preguntas'
import { costoDe, cupoIA, registrarUso } from '@/lib/ia'
import { problemasDelTexto } from '@/lib/preguntasTexto'
import { publicarRespuesta } from '@/lib/responderPregunta'
import { automaticasPausadas } from '@/lib/automaticasPreguntas'

export type ModoIA = 'apagado' | 'sombra' | 'real'
export interface ConfigIA { modo: ModoIA; desde: string | null }
export interface DecisionIA {
  modo: ModoIA; decision: 'sola' | 'revisar'; motivos: string[]; respuesta: string; confianza: string
  verificacion: string | null; modelo: string; costo: number; fecha: string; publicada?: boolean; error?: string
  marca?: 'bien' | 'mal' | null; marcada_at?: string
}

export const CLAVE_IA_AUTO = 'preguntas_ia_auto'
const POR_PASADA = 3                       // cada borrador tarda ~10–20 s; el cron pasa cada pocos minutos
const HORAS_MAX = 24                       // una pregunta más vieja ya la está viendo una persona

export async function configIA(db: Pool): Promise<ConfigIA> {
  const { rows: [r] } = await db.query(`SELECT value FROM app_settings WHERE key = $1`, [CLAVE_IA_AUTO])
  try {
    const v = JSON.parse(r?.value ?? '{}')
    return { modo: ['sombra', 'real'].includes(v.modo) ? v.modo : 'apagado', desde: v.desde ?? null }
  } catch { return { modo: 'apagado', desde: null } }
}

// "No tenemos / no hay / agotado": decir que no de más pierde la venta (y el stock de la publicación puede ir atrasado),
// así que siempre lo ve una persona.
const NEGATIVA = /\bno (lo |la |los |las )?(tenemos|tengo|hay|queda|quedan|contamos)\b|\bno (est[aá]|se encuentra)n? disponible|agotad|sin (stock|existencia|disponibilidad)/i
const OTRA_PUBLICACION = /https?:\/\/|mercadolibre\.com|\bML[A-Z]-?\d{6,}/i

/** Por qué una respuesta de la IA NO saldría sola (vacío = saldría sola). */
export function motivosRevisar(b: { respuesta: string; confianza: string; falta_dato: string | null; verificacion: string | null },
  itemEstado: string | null): string[] {
  const m: string[] = []
  if (!b.respuesta) return ['La IA no propuso respuesta']
  if (b.confianza !== 'alta') m.push(`Confianza ${b.confianza}${b.falta_dato ? `: ${b.falta_dato}` : ''}`)
  else if (b.verificacion && b.verificacion !== 'ok') m.push(b.verificacion)
  if (NEGATIVA.test(b.respuesta)) m.push('Dice que no hay: lo confirma una persona')
  if (OTRA_PUBLICACION.test(b.respuesta)) m.push('Recomienda otra publicación')
  if (itemEstado && itemEstado !== 'active') m.push('La publicación no está activa')
  const p = problemasDelTexto(b.respuesta)
  if (p.length) m.push(`MercadoLibre la borraría: ${p.join(', ')}`)
  return m
}

/** Lo llama el cron (después de las respuestas rápidas automáticas). Devuelve el resumen de la pasada o null. */
export async function procesarIAAutomatica(db: Pool, empresaId: number, country: string) {
  const cfg = await configIA(db)
  if (cfg.modo === 'apagado' || !iaConfigurada()) return null
  // La pausa general frena también lo real; la prueba sigue midiendo (no publica nada).
  const pausada = cfg.modo === 'real' && await automaticasPausadas(db)
  if (pausada) return null
  const cupo = await cupoIA(db, empresaId)
  if (cupo.agotado) return { sinCreditos: true }
  // Reserva atómica: dos pasadas del cron (o las dos copias de la app) no procesan la misma pregunta.
  const { rows } = await db.query(
    `UPDATE ml_preguntas SET ia_auto = '{"estado":"procesando"}'::jsonb
     WHERE id IN (SELECT id FROM ml_preguntas
                  WHERE estado = 'UNANSWERED' AND ia_auto IS NULL
                    AND fecha > NOW() - make_interval(hours => $1) AND fecha >= COALESCE($2::timestamptz, NOW())
                  ORDER BY fecha LIMIT $3 FOR UPDATE SKIP LOCKED)
     RETURNING id::text, item_estado`,
    [HORAS_MAX, cfg.desde, Math.min(POR_PASADA, cupo.quedan ?? POR_PASADA)])
  let solas = 0, revisar = 0, publicadas = 0, fallas = 0
  for (const q of rows) {
    try {
      const c = await armarContexto(db, Number(q.id), country)
      const b = await pedirBorrador(c, false)
      await registrarUso(db, 'preguntas', b.llamadas, null)
      const motivos = motivosRevisar(b, c.item?.status ?? q.item_estado)
      const d: DecisionIA = {
        modo: cfg.modo, decision: motivos.length ? 'revisar' : 'sola', motivos, respuesta: b.respuesta, confianza: b.confianza,
        verificacion: b.verificacion, modelo: b.modelo, costo: b.llamadas.reduce((a, l) => a + costoDe(l.modelo, l.uso, l.lote), 0),
        fecha: new Date().toISOString(),
      }
      if (d.decision === 'sola' && cfg.modo === 'real') {
        const r = await publicarRespuesta(db, q.id, b.respuesta, { fuente: 'ia_auto', base: b.respuesta })
        d.publicada = r.ok && !!r.publicada
        if (!r.ok) d.error = r.error
        if (d.publicada) publicadas++; else fallas++
      }
      d.decision === 'sola' ? solas++ : revisar++
      // Activa: la respuesta queda como borrador (quien abra la pregunta la encuentra escrita). En prueba NO: el equipo
      // responde como siempre y su respuesta queda para comparar.
      await db.query(
        `UPDATE ml_preguntas SET ia_auto = $2,
           borrador = CASE WHEN borrador IS NULL AND $6 THEN $3 ELSE borrador END,
           borrador_confianza = CASE WHEN borrador IS NULL AND $6 THEN $4 ELSE borrador_confianza END,
           borrador_falta = CASE WHEN borrador IS NULL AND $6 THEN $5 ELSE borrador_falta END,
           borrador_web = CASE WHEN borrador IS NULL AND $6 THEN FALSE ELSE borrador_web END,
           borrador_at = CASE WHEN borrador IS NULL AND $6 THEN NOW() ELSE borrador_at END
         WHERE id = $1`,
        [q.id, JSON.stringify(d), b.respuesta || null, b.confianza, motivos.join(' · ') || null, cfg.modo === 'real'])
    } catch (e) {
      fallas++
      const msg = e instanceof Error ? e.message : String(e)
      console.error('[ia automatica]', q.id, msg)
      await db.query(`UPDATE ml_preguntas SET ia_auto = $2 WHERE id = $1`,
        [q.id, JSON.stringify({ modo: cfg.modo, decision: 'revisar', motivos: ['Error de la IA'], error: msg.slice(0, 200), fecha: new Date().toISOString() })])
    }
  }
  return rows.length ? { solas, revisar, publicadas, fallas } : null
}
