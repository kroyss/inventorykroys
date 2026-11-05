// Respuesta automática con IA (01-11-2026, plan del dueño tras la evaluación de octubre: 37 de 38 bien en confianza alta).
// El cron, después de las respuestas rápidas automáticas, le pide a la IA cada pregunta NUEVA y decide:
//   - "sola": confianza alta + verificador OK + no dice que no hay + no manda a otra publicación + publicación activa
//     + el texto no tiene nada que MercadoLibre borre;
//   - "revisar": todo lo demás, con el motivo. La respuesta queda escrita como borrador para que una persona la mande.
// Modos (app_settings.preguntas_ia_auto): apagado · sombra (decide pero NO publica: para medir, el vendedor marca cada una
// bien o mal) · real (publica las "sola"). La pausa de las respuestas automáticas (preguntas_auto_pausa) la frena igual.
// Cada pregunta procesada usa 1 crédito de IA (ia_uso.modulo = 'preguntas'); sin créditos no procesa.
import type { Pool } from 'pg'
import { armarContexto, datosPublicacion, pedirBorrador, iaConfigurada } from '@/lib/preguntas'
import { costoDe, cupoIA, registrarUso } from '@/lib/ia'
import { problemasDelTexto } from '@/lib/preguntasTexto'
import { publicarRespuesta } from '@/lib/responderPregunta'
import { automaticasPausadas } from '@/lib/automaticasPreguntas'
import { simularEconomica, type DecisionEco } from '@/lib/iaEconomica'

export type ModoIA = 'apagado' | 'sombra' | 'real'
export interface ConfigIA { modo: ModoIA; desde: string | null }
export interface DecisionIA {
  modo: ModoIA; decision: 'sola' | 'revisar'; motivos: string[]; respuesta: string; confianza: string
  verificacion: string | null; modelo: string; costo: number; fecha: string; publicada?: boolean; error?: string
  marca?: 'bien' | 'mal' | null; marcada_at?: string
  entrada?: number; salida?: number        // tokens (04-11, para comparar con la versión económica)
  eco?: DecisionEco                         // la versión económica en paralelo (lib/iaEconomica.ts)
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
// Modo prueba 01–04/11 (78 de 79 bien): el único error fue un monto inventado ("cobro destino por MRW aprox. 1.600 Bs").
// Montos en bolívares, estimados y cobros a destino con cifra cambian a diario: siempre una persona.
const MONTO = /\d[\d.,]*\s?(bs\b|bs\.|bol[ií]vares)|\bbs\.?\s?\d|aproximad|cobro (a |en )?destino[^.]*\d/i
// Pedidos grandes (5 o más unidades, al mayor): se coordinan aparte ("oferte por el máximo disponible y coordinamos").
const MUCHAS = /\b([5-9]|\d{2,})\s*(unidades|unds?\b|packs?|piezas|pares|cajas|docenas?)|al mayor|mayorista/i

// 05-11 (evaluación del dueño de la económica): 4 casos que siempre ve una persona.
// Precio en divisa / dólares / efectivo: "el publicado BCV" no contesta lo que preguntan (fallaron la real y la económica).
const DIVISA = /divisas?|en d[oó]lares|precio en \$|en efectivo|\bverdes?\b|\busdt?\b/i
// Medios de pago fuera de MercadoLibre (Cashea, Zelle, Binance...): la IA inventó "sí contamos con Cashea".
const PAGO = /cashea|zelle|binance|paypal|zinli|wally|reserve|cripto|pago m[oó]vil|transferencia|efectivo|krece|lysto/i
// Compatibilidad con un vehículo o modelo: la IA confirmó "sí para Kia Picanto" sin tenerlo.
const VEHICULO = /\b(kia|toyota|chevrolet|chevy|ford|fiat|hyundai|mitsubishi|renault|nissan|mazda|honda|jeep|chery|volkswagen|vw|peugeot|suzuki|dodge|chrysler|daewoo|iveco|mercedes|bmw|audi|seat|jac|dongfeng|great wall|bera|empire|yamaha|bajaj|skygo|picanto|aveo|corolla|fiesta|optra|spark|cherokee|hilux|terios|yaris)\b|\b(modelo|año)\s+(19|20)\d{2}\b|\b(19|20)\d{2}\b.*\b(carro|camioneta|moto|veh[ií]culo)\b/i
const SIN_CONFIRMAR = /no (lo )?(tenemos|est[aá]) confirmad|verific|consult|no (es|son) compatible|no (sirve|aplica|funciona)/i
// Fabricante o marca: la IA inventó "fabricante nacional (Madecor)". Si nombra uno que no está en la publicación, revisar.
const FABRICANTE = /fabric(ante|ado|ados|ada|adas|amos|an|ación)|\bmarca\b/i
function fabricanteInventado(respuesta: string, datos: string) {
  if (!FABRICANTE.test(respuesta)) return false
  const d = datos.toLowerCase()
  if (!d.trim()) return true
  // Nombres propios de la respuesta (mayúscula inicial, no al comienzo de frase) que no aparecen en la publicación.
  const nombres = [...respuesta.matchAll(/(?<![.!?¡¿]\s|^)\b([A-ZÁÉÍÓÚÑ][\wáéíóúñ-]{2,})/g)].map(x => x[1].toLowerCase())
    .filter(n => !['buenas', 'buenos', 'hola', 'saludos', 'mercadolibre', 'mercado', 'libre', 'zoom', 'tealca', 'mrw', 'bcv', 'usd', 'quedo'].includes(n))
  if (!nombres.length) return !/fabric|nacional|importad/i.test(d)
  return nombres.some(n => !d.includes(n))
}

/** Por qué una respuesta de la IA NO saldría sola (vacío = saldría sola). `datos`: textos de la publicación. */
const TERCERO = /\b(la|esta) (publicaci[oó]n|ficha|descripci[oó]n) (solo |no )?(indica|dice|especifica|menciona|muestra|aclara|detalla)|seg[uú]n (la|esta) (publicaci[oó]n|ficha|descripci[oó]n)|los datos (indican|dicen)/i
export function motivosRevisar(b: { respuesta: string; confianza: string; falta_dato: string | null; verificacion: string | null },
  itemEstado: string | null, pregunta = '', datos = ''): string[] {
  const m: string[] = []
  if (!b.respuesta) return ['La IA no propuso respuesta']
  if (b.confianza !== 'alta') m.push(`Confianza ${b.confianza}${b.falta_dato ? `: ${b.falta_dato}` : ''}`)
  else if (b.verificacion && b.verificacion !== 'ok') m.push(b.verificacion)
  if (NEGATIVA.test(b.respuesta)) m.push('Dice que no hay: lo confirma una persona')
  if (OTRA_PUBLICACION.test(b.respuesta)) m.push('Recomienda otra publicación')
  // 04-11 (el dueño): habla como un tercero ("la publicación no especifica"), no como el equipo.
  if (TERCERO.test(b.respuesta)) m.push('Habla como un tercero («la publicación indica…»)')
  if (MONTO.test(b.respuesta)) m.push('Da un monto en bolívares o un estimado: lo confirma una persona')
  if (MUCHAS.test(pregunta)) m.push('Pide muchas unidades: lo coordina una persona')
  if (DIVISA.test(pregunta)) m.push('Pregunta precio en divisa: lo contesta una persona')
  if (PAGO.test(pregunta)) m.push('Pregunta por un medio de pago: lo confirma una persona')
  if (VEHICULO.test(pregunta) && !SIN_CONFIRMAR.test(b.respuesta)) m.push('Confirma compatibilidad con un vehículo o modelo')
  if (fabricanteInventado(b.respuesta, datos)) m.push('Menciona un fabricante o marca no confirmada')
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
      const motivos = motivosRevisar(b, c.item?.status ?? q.item_estado, c.pregunta.texto, datosPublicacion(c))
      const d: DecisionIA = {
        modo: cfg.modo, decision: motivos.length ? 'revisar' : 'sola', motivos, respuesta: b.respuesta, confianza: b.confianza,
        verificacion: b.verificacion, modelo: b.modelo, costo: b.llamadas.reduce((a, l) => a + costoDe(l.modelo, l.uso, l.lote), 0),
        fecha: new Date().toISOString(),
        entrada: b.llamadas.reduce((a, l) => a + (l.uso.input_tokens ?? 0) + (l.uso.cache_creation_input_tokens ?? 0) + (l.uso.cache_read_input_tokens ?? 0), 0),
        salida: b.llamadas.reduce((a, l) => a + (l.uso.output_tokens ?? 0), 0),
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
      // Versión económica en paralelo (después de publicar la real, así no la demora). Si falla, la real no se entera.
      try {
        const eco = await simularEconomica(db, c, c.item?.status ?? q.item_estado, motivosRevisar)
        await db.query(`UPDATE ml_preguntas SET ia_auto = ia_auto || jsonb_build_object('eco', $2::jsonb) WHERE id = $1`, [q.id, JSON.stringify(eco)])
      } catch (e) {
        console.error('[ia economica]', q.id, e instanceof Error ? e.message : e)
        await db.query(`UPDATE ml_preguntas SET ia_auto = ia_auto || jsonb_build_object('eco', $2::jsonb) WHERE id = $1`,
          [q.id, JSON.stringify({ error: (e instanceof Error ? e.message : String(e)).slice(0, 200) })]).catch(() => {})
      }
    } catch (e) {
      fallas++
      const msg = e instanceof Error ? e.message : String(e)
      console.error('[ia automatica]', q.id, msg)
      await db.query(`UPDATE ml_preguntas SET ia_auto = $2 WHERE id = $1`,
        [q.id, JSON.stringify({ modo: cfg.modo, decision: 'revisar', motivos: ['Error de la IA'], error: msg.slice(0, 200), fecha: new Date().toISOString() })])
    }
  }
  // Sin preguntas nuevas: la versión económica repasa de a poco las ya procesadas desde el 01-11 (las del modo prueba,
  // muchas marcadas por el dueño), así la comparación arranca con historial y no solo con lo que llegue hoy.
  if (!rows.length) {
    const r = await repasarEconomica(db, country).catch(e => { console.error('[ia economica repaso]', e instanceof Error ? e.message : e); return 0 })
    return r ? { repasoEconomica: r } : null
  }
  return { solas, revisar, publicadas, fallas }
}

const REPASO_DESDE = '2026-11-01'
const REPASO_POR_PASADA = 2

async function repasarEconomica(db: Pool, country: string) {
  const { rows } = await db.query(
    `UPDATE ml_preguntas SET ia_auto = ia_auto || '{"eco":{"estado":"procesando"}}'::jsonb
     WHERE id IN (SELECT id FROM ml_preguntas
                  WHERE ia_auto ? 'decision' AND NOT ia_auto ? 'eco' AND fecha >= $1::date
                  ORDER BY fecha DESC LIMIT $2 FOR UPDATE SKIP LOCKED)
     RETURNING id::text, item_estado`, [REPASO_DESDE, REPASO_POR_PASADA])
  for (const q of rows) {
    try {
      const c = await armarContexto(db, Number(q.id), country)
      const eco = await simularEconomica(db, c, c.item?.status ?? q.item_estado, motivosRevisar)
      await db.query(`UPDATE ml_preguntas SET ia_auto = ia_auto || jsonb_build_object('eco', $2::jsonb) WHERE id = $1`, [q.id, JSON.stringify(eco)])
    } catch (e) {
      await db.query(`UPDATE ml_preguntas SET ia_auto = ia_auto || jsonb_build_object('eco', $2::jsonb) WHERE id = $1`,
        [q.id, JSON.stringify({ error: (e instanceof Error ? e.message : String(e)).slice(0, 200) })]).catch(() => {})
    }
  }
  return rows.length
}
