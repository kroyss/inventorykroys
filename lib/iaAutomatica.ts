// Respuesta automática con IA (01-11-2026, plan del dueño tras la evaluación de octubre: 37 de 38 bien en confianza alta).
// El cron, después de las respuestas rápidas automáticas, le pide a la IA cada pregunta NUEVA y decide:
//   - "sola": confianza alta + verificador OK + no dice que no hay + no manda a otra publicación + publicación activa
//     + el texto no tiene nada que MercadoLibre borre;
//   - "revisar": todo lo demás, con el motivo. La respuesta queda escrita como borrador para que una persona la mande.
// Modos (app_settings.preguntas_ia_auto): apagado · sombra (decide pero NO publica: para medir, el vendedor marca cada una
// bien o mal) · real (publica las "sola"). La pausa de las respuestas automáticas (preguntas_auto_pausa) la frena igual.
// Cada pregunta procesada usa 1 crédito de IA (ia_uso.modulo = 'preguntas'); sin créditos no procesa.
import type { Pool } from 'pg'
import { CODIGO_INTERNO } from '@/lib/codigoInterno'
import { armarContexto, bloqueContexto, corregirBorrador, datosCompatibilidad, datosPublicacion, pedirBorrador, iaConfigurada, textoVendedor, type Contexto } from '@/lib/preguntas'
import { verificarBorrador } from '@/lib/verificadorIA'
import type { LlamadaIA } from '@/lib/ia'
import { costoDe, cupoIA, registrarUso, MODELO_ECO55 } from '@/lib/ia'
import { problemasDelTexto } from '@/lib/preguntasTexto'
import { publicarRespuesta } from '@/lib/responderPregunta'
import { automaticasPausadas } from '@/lib/automaticasPreguntas'
import { simularEconomica, type DecisionEco } from '@/lib/iaEconomica'
import { fraseEscapePreguntas, leerFrenos, motivosFrenos, MOTIVO_TOPE } from '@/lib/iaFrenos'
import { SIN_CONFIRMAR, compatibilidadRespaldada, preguntaDeVehiculo, sinTildes } from '@/lib/iaCompatibilidad'

export type ModoIA = 'apagado' | 'sombra' | 'real'
// todo (10-11, el dueño): «Responder todo» = activa SIN modo seguro: publica también lo que los frenos dejarían para revisar
// (solo respeta los frenos que configura el vendedor: horario y máximo por comprador). Independiente de Mensajes.
export interface ConfigIA { modo: ModoIA; desde: string | null; v2?: boolean; todo?: boolean }   // v2 (07-11): desde el 09-11 la de todos ("v2": false la apaga)
export interface DecisionIA {
  modo: ModoIA; decision: 'sola' | 'revisar'; motivos: string[]; respuesta: string; confianza: string
  verificacion: string | null; modelo: string; costo: number; fecha: string; publicada?: boolean; error?: string
  escape?: boolean                          // «Responder todo» (08-11): se contestó con la frase de Preguntas
  sinSeguro?: boolean                       // 10-11: salió en modo «Responder todo»; motivos = lo que la habría frenado
  version?: 'v2'
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
    // 09-11: el Modo prueba ('sombra') se quitó: gastaba créditos sin publicar nada. Quien lo tenía queda apagado.
    return { modo: v.modo === 'real' ? 'real' : 'apagado', desde: v.desde ?? null, v2: v.v2 !== false, todo: v.todo === true }
  } catch { return { modo: 'apagado', desde: null, v2: true } }
}

// "No tenemos / no hay / agotado": decir que no de más pierde la venta (y el stock de la publicación puede ir atrasado),
// así que siempre lo ve una persona.
// 12-11 (el dueño: "no tenemos la circunferencia" se frenó como si no hubiera el producto): el "no hay" frena solo si habla
// de EXISTENCIAS (stock, agotado, una variante o modelo que no hay). "No tenemos <un dato>" es falta de dato: lo cuida el
// verificador (que no se invente nada), no este freno.
const EXISTENCIA_SIEMPRE = /\bno hay\b(?! (ning[uú]n )?(problema|inconveniente|rollo|drama))|\bno (nos )?quedan?\b|agotad|sin (stock|existencia|disponibilidad)|\bno (est[aá]|se encuentra)n? disponible/i
const NO_TENEMOS = /\bno (lo |la |los |las )?(tenemos|tengo|contamos)\b([^.;!?\n]{0,50})/gi
const OTRA_MEDIDA = /^\s*(de|en)\s+\d|\b(el|la|los|las|ese|esa|esos|esas) de\b|\bde \d/i
const ES_EXISTENCIA = /disponib|stock|venta\b|de momento|existencia|unidad|inventario|\bcolou?r|modelo|talla|variante|tama[ñn]o|presentaci|versi[oó]n|referencia|\bmarca\b|\b(el|la|los|las|ese|esa|esos|esas) de\b|\b(ese|esa|esos|esas|eso)\b|\b(rojo|azul|negro|blanco|verde|amarillo|gris|rosad?o|morado|naranja|marr[oó]n|dorado|plateado)s?\b|por (ahora|el momento)|en este momento|ahorita|\bm[aá]s\b|\botr[oa]s?\b|\b(en|de) venta\b/i
// Lo que es un DATO del producto (manda sobre lo anterior: "no tenemos ese dato" no es de existencias).
const ES_DATO = /\bdatos?\b|informaci[oó]n|medidas?\b|especificaci|detalle|ficha|circunferencia|di[aá]metro|largo|ancho|\balto\b|grosor|espesor|peso|potencia|voltaje|amperaje|capacidad|material|dimensi|cent[ií]metros|mil[ií]metros|pulgadas|exact/i
export function esDeExistencias(t: string) {
  if (EXISTENCIA_SIEMPRE.test(t)) return true
  for (const m of t.matchAll(NO_TENEMOS)) {
    const antes = t.slice(Math.max(0, (m.index ?? 0) - 40), m.index ?? 0).split(/[.;!?\n]/).pop() ?? ''
    const ventana = m[1] ? `${antes} ${m[3] ?? ''}` : (m[3] ?? '')
    if (OTRA_MEDIDA.test(m[3] ?? '')) return true        // "no tenemos de 3 pulgadas" = otra variante, no un dato
    if (ES_DATO.test(ventana)) continue                 // "la circunferencia no la tenemos", "no tenemos ese dato"
    if (ES_EXISTENCIA.test(ventana)) return true         // "esa talla no la tenemos", "no tenemos el rojo"
    // "no lo tenemos." a secas (sin decir qué): se trata como del producto.
    if (!/[a-záéíóúñ]{3,}/i.test(ventana.replace(/\b(lo|la|los|las|y|ya|pero|por|el|un|una|que|le|se)\b/gi, ''))) return true
  }
  return false
}
// 12-11 (el dueño): cancelar, devolver, reclamar o "no me llegó" lo contesta siempre una persona (con o sin corrección).
const POSVENTA = /can[cs]el\w*\b[^.?!]{0,30}(compra|pedido|orden|venta)|\banul|devol|reembols|reclam|no (me )?(ha )?lleg|(lleg|vino|vinieron)\w* (da[ñn]|rot|mal|incomplet|equivocad)|defectuos|estafa|denunci/i
export const MOTIVO_POSVENTA = 'Cancelación, devolución o reclamo: lo responde una persona'
const NEGATIVA = /\bno (lo |la |los |las )?(tenemos|tengo|hay(?! (ning[uú]n )?(problema|inconveniente|rollo|drama))|queda|quedan|contamos)\b|\bno (est[aá]|se encuentra)n? disponible|agotad|sin (stock|existencia|disponibilidad)/i
// 11-11: "déjanos verificarlo / te confirmamos": una vez publicada la pregunta no se puede volver a contestar.
const PROMESA = /d[eé]j[ae]n?(me|nos)( lo)? (verificar|revisar|confirmar)|(lo|le|te) (verificamos|confirmamos|averiguamos)|prefiero confirmarlo|confirmarlo con (una persona|el equipo)|en breve (le|te) (confirmo|confirmamos|respondo)/i
const META = /bla respuesta esb|no requiere (una )?respuesta|bel borradorb|bel comprador (dice|pregunta|escribe)|como (asistente|modelo de lenguaje)b/i
const OTRA_PUBLICACION = /https?:\/\/|mercadolibre\.com|\bML[A-Z]-?\d{6,}/i
// 10-11 (competencia, el dueño): invitar al catálogo de la tienda ante la duda está bien: ese link no frena.
const CATALOGO = /https?:\/\/listado\.mercadolibre\.com\.(ve|co)\/_CustId_\d+\S*/gi
// «No lo tenemos confirmado / no lo hemos probado» no es decir que no hay.
const SIN_CONFIRMAR_FRASE = /\bno (lo |la |los |las )?(tenemos|hemos) (confirmad|probad|verificad)\w*|\bno (lo |la |los |las )?(tenemos|manejamos) (con exactitud|exact\w*|especificad\w*)|\b(potencia|material|medidas?|peso|dato|datos|tiempo|voltaje|capacidad|autonom[ií]a|duraci[oó]n|rango|vatios|watts?|amperaje|dimensiones)\b[^.,;]{0,30}?\bno (lo |la |los |las )?tenemos\b/gi
// Modo prueba 01–04/11 (78 de 79 bien): el único error fue un monto inventado ("cobro destino por MRW aprox. 1.600 Bs").
// Montos en bolívares, estimados y cobros a destino con cifra cambian a diario: siempre una persona.
const MONTO = /\d[\d.,]*\s?(bs\b|bs\.|bol[ií]vares)|\bbs\.?\s?\d|aproximad|cobro (a |en )?destino[^.]*\d/i
// Pedidos grandes (5 o más unidades, al mayor): se coordinan aparte ("oferte por el máximo disponible y coordinamos").
const MUCHAS = /\b([5-9]|\d{2,})\s*(unidades|unds?\b|packs?|piezas|pares|cajas|docenas?)|al mayor|mayorista/i

// 05-11 (evaluación del dueño de la económica): 4 casos que siempre ve una persona.
// Precio en divisa / dólares / efectivo: "el publicado BCV" no contesta lo que preguntan (fallaron la real y la económica).
// 11-11: "luz verde", "color verde" no es "verdes" (dólares).
const DIVISA = /divisas?|en d[oó]lares|precio en \$|en efectivo|(?<!(luz|luces|color|colores|tono|led|leds) )\bverdes?\b|\busdt?\b/i
// Medios de pago fuera de MercadoLibre (Cashea, Zelle, Binance...): la IA inventó "sí contamos con Cashea".
const PAGO = /cashea|zelle|binance|paypal|zinli|wally|reserve|cripto|pago m[oó]vil|transferencia|efectivo|krece|lysto/i
// v2 (07-11, el dueño): el medio de pago no frena si está ESCRITO en lo del vendedor (Mi IA, políticas, respuestas rápidas):
// todos los que nombran la pregunta y la respuesta tienen que estar ahí. Cashea/Zelle inventados siguen frenando.
// 10-11 (el dueño): un medio que NO está en lo del vendedor (Cashea) también está bien si la respuesta dice que no trabajamos
// con él y el vendedor tiene su lista de medios escrita.
function pagoEscrito(pregunta: string, respuesta: string, vendedor: string) {
  const v = sinTildes(vendedor), r = sinTildes(respuesta)
  const medios = [...sinTildes(pregunta + ' ' + respuesta).matchAll(new RegExp(PAGO.source, 'gi'))].map(m => m[0])
  const negado = (m: string) => /medios de pago/.test(v) && new RegExp(`no (trabajamos|aceptamos|manejamos|contamos|tenemos)( pagos?)?( con| por)? ${m}`).test(r)
  return medios.length > 0 && v.trim() !== '' && medios.every(m => v.includes(m) || negado(m))
}
// Compatibilidad con un vehículo o modelo (lib/iaCompatibilidad.ts): la IA confirmó "sí para Kia Picanto" sin tenerlo.
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
// v2 (07-11): "no tenemos esa" deja de frenar si el verificador la encontró respaldada (VARIANTES/STOCK) y la confianza es alta.
// `compat` (09-11): todo lo escrito de la publicación (datosCompatibilidad: + ficha técnica, notas y fotos) para el freno de
// compatibilidad con vehículos; si no se pasa, usa `datos`.
export function motivosRevisar(b: { respuesta: string; confianza: string; falta_dato: string | null; verificacion: string | null },
  itemEstado: string | null, pregunta = '', datos = '', v2 = false, vendedor = '', compat = datos): string[] {
  const m: string[] = []
  if (!b.respuesta) return [`La IA no propuso respuesta${b.falta_dato ? `: ${b.falta_dato}` : ''}`]
  if (CODIGO_INTERNO.test(b.respuesta)) return ['La IA devolvió texto inválido: lo revisa una persona']
  // 08-11 (el dueño, con 65 marcadas): confianza baja o media SOLA ya no frena si el verificador aprobó la respuesta
  // (nada afirmado fuera de los datos). Las demás reglas (no hay, pagos, montos, otra publicación…) siguen frenando.
  if (b.confianza !== 'alta' && b.verificacion !== 'ok') m.push(`Confianza ${b.confianza}${b.falta_dato ? `: ${b.falta_dato}` : ''}`)
  else if (b.confianza === 'alta' && b.verificacion && b.verificacion !== 'ok') m.push(b.verificacion)
  const sinCat = b.respuesta.replace(CATALOGO, '')
  let paraNegativa = sinCat.replace(SIN_CONFIRMAR_FRASE, '')
  // «No trabajamos con Cashea» con la lista de medios escrita no es «no hay» (el medio ya se revisa en pagoEscrito).
  if (v2 && PAGO.test(pregunta) && pagoEscrito(pregunta, b.respuesta, vendedor))
    paraNegativa = paraNegativa.replace(/no (trabajamos|aceptamos|contamos|manejamos|tenemos)( pagos?)?( con| por)? [^,.;]*/gi, '')
  const negativa = NEGATIVA.test(paraNegativa) && esDeExistencias(paraNegativa)
  // 11-11 (el dueño): "no tenemos esa, mira nuestro catálogo: <link>" con el verificador conforme tampoco frena: el comprador
  // igual encuentra lo que sí hay (pedido de la competencia, 10-11).
  const invitaCatalogo = sinCat !== b.respuesta
  if (negativa && !(v2 && b.verificacion === 'ok' && (b.confianza === 'alta' || invitaCatalogo))) m.push('Dice que no hay: lo confirma una persona')
  // 11-11 (medición v3: 4 de 4 podían salir): el link a OTRA publicación del vendedor con el verificador conforme no frena.
  if (OTRA_PUBLICACION.test(sinCat) && !(v2 && b.verificacion === 'ok' && !/https?:\/\/(?!articulo\.mercadolibre\.com\.(ve|co)\/)/i.test(sinCat))) m.push('Recomienda otra publicación')
  // 11-11: la IA a veces contesta "hablando de" la pregunta ("la respuesta es…", "no requiere respuesta"): nunca sale sola.
  if (META.test(b.respuesta)) m.push('La respuesta no le habla al comprador: lo revisa una persona')
  // 04-11 (el dueño): habla como un tercero ("la publicación no especifica"), no como el equipo.
  if (TERCERO.test(b.respuesta)) m.push('Habla como un tercero («la publicación indica…»)')
  if (PROMESA.test(b.respuesta)) m.push('Promete verificar o confirmar después: lo responde una persona')
  if (MONTO.test(b.respuesta)) m.push('Da un monto en bolívares o un estimado: lo confirma una persona')
  if (MUCHAS.test(pregunta)) m.push('Pide muchas unidades: lo coordina una persona')
  if (POSVENTA.test(pregunta)) m.push(MOTIVO_POSVENTA)
  if (DIVISA.test(pregunta)) m.push('Pregunta precio en divisa: lo contesta una persona')
  if (PAGO.test(pregunta) && !(v2 && pagoEscrito(pregunta, b.respuesta, vendedor))) m.push('Pregunta por un medio de pago: lo confirma una persona')
  // 09-11 (el dueño): lo escrito en la publicación (universal / el modelo nombrado) respalda la respuesta y no frena, siempre que
  // el verificador la haya aprobado. Sin dato escrito, o con el verificador en duda, la confirma una persona.
  if (preguntaDeVehiculo(pregunta, compat) && !SIN_CONFIRMAR.test(b.respuesta)
      && !(b.verificacion === 'ok' && compatibilidadRespaldada(pregunta, compat))) m.push('Confirma compatibilidad con un vehículo o modelo')
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
     RETURNING id::text, item_estado, comprador_id::text`,
    [HORAS_MAX, cfg.desde, Math.min(POR_PASADA, cupo.quedan ?? POR_PASADA)])
  let solas = 0, revisar = 0, publicadas = 0, fallas = 0
  // Frenos (07-11, lib/iaFrenos.ts): horario y tope por comprador. Solo en modo real (la prueba mide sin ellos).
  const frenos = cfg.modo === 'real' && rows.length ? await leerFrenos(db) : null
  for (const q of rows) {
    try {
      const c = await armarContexto(db, Number(q.id), country)
      let b: Awaited<ReturnType<typeof pedirBorrador>> & { corregida?: boolean; original?: string } = await pedirBorrador(c, false, undefined, cfg.v2, true)
      let motivos = motivosRevisar(b, c.item?.status ?? q.item_estado, c.pregunta.texto, datosPublicacion(c), cfg.v2, textoVendedor(c), datosCompatibilidad(c))
      // 12-11: frenada por algo que se arregla escribiendo → la IA la corrige (y vuelve a pasar por todo).
      if (cfg.v2) {
        const k = await corregirPregunta(c, b, motivos, c.item?.status ?? q.item_estado)
        if (k) {
          b = { ...b, llamadas: [...b.llamadas, ...k.llamadas], ...(k.motivos.length ? { corregida: false } : { ...k.b }) }
          if (!k.motivos.length) motivos = []
        }
      }
      await registrarUso(db, 'preguntas', b.llamadas, null)
      const deFrenos = frenos ? await motivosFrenos(db, frenos, country, 'preguntas', q.comprador_id) : []
      motivos.push(...deFrenos)
      // «Responder todo»: con respuesta escrita sale igual, salvo los frenos del vendedor (horario, máximo por comprador).
      // 12-11 (el dueño): en Modo Total la posventa (cancelar, devolver, reclamo) tampoco la publica la IA: va a una persona
      // y, si hay frase de escape, se contesta con ella (así igual nada queda sin respuesta).
      const sinSeguro = cfg.modo === 'real' && cfg.todo === true && !!b.respuesta && motivos.length > 0 && !deFrenos.length
        && !motivos.includes(MOTIVO_POSVENTA)
      const d: DecisionIA = {
        modo: cfg.modo, decision: motivos.length && !sinSeguro ? 'revisar' : 'sola', motivos, ...(sinSeguro ? { sinSeguro: true } : {}), respuesta: b.respuesta, confianza: b.confianza,
        verificacion: b.verificacion, modelo: b.modelo, costo: b.llamadas.reduce((a, l) => a + costoDe(l.modelo, l.uso, l.lote), 0),
        fecha: new Date().toISOString(), ...(cfg.v2 ? { version: 'v2' as const } : {}), ...(b.corregida ? { corregida: true, original: b.original } : {}),
        entrada: b.llamadas.reduce((a, l) => a + (l.uso.input_tokens ?? 0) + (l.uso.cache_creation_input_tokens ?? 0) + (l.uso.cache_read_input_tokens ?? 0), 0),
        salida: b.llamadas.reduce((a, l) => a + (l.uso.output_tokens ?? 0), 0),
      }
      if (d.decision === 'sola' && cfg.modo === 'real') {
        const r = await publicarRespuesta(db, q.id, b.respuesta, { fuente: 'ia_auto', base: b.respuesta })
        d.publicada = r.ok && !!r.publicada
        if (!r.ok) d.error = r.error
        if (d.publicada) publicadas++; else fallas++
      } else if (d.decision === 'revisar' && cfg.modo === 'real' && frenos && (cfg.todo === true || frenos.escapeSeguro)
                 && !motivos.some(m => m.startsWith(MOTIVO_TOPE)) && (c.item?.status ?? q.item_estado) !== 'paused') {
        // 12-11: Modo Total la usa siempre (precargada con la de fábrica); Modo Seguro solo si la activó.
        const frase = fraseEscapePreguntas(frenos)
        // «Responder todo» (opcional): la pregunta no queda sin contestar; la respuesta de la IA queda escrita para ver.
        const r = await publicarRespuesta(db, q.id, frase, { fuente: 'ia_escape', base: frase })
        if (r.ok && r.publicada) d.escape = true
        else if (!r.ok) d.error = r.error
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
        [q.id, JSON.stringify(d), b.respuesta || null, b.confianza, motivos.join(' · ') || null, cfg.modo === 'real' && d.decision === 'revisar'])
      // 08-11: la versión económica en paralelo se apagó: Haiku 5.5 ya escribe la real (la comparación queda como historial).
      // 06-11: la económica ya corre con Haiku 5.5 (MODELO_SIMPLE): la prueba aparte (eco55) quedó como historial.
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
  // 08-11: el repaso de la versión económica se apagó (ver arriba).
  if (!rows.length) return null
  return { solas, revisar, publicadas, fallas }
}

async function simularEco55(db: Pool, id: string, c: Awaited<ReturnType<typeof armarContexto>>, itemEstado: string | null) {
  try {
    const eco = await simularEconomica(db, c, itemEstado, motivosRevisar, MODELO_ECO55)
    // Misma respuesta exacta que la económica con Haiku 4.5 ya marcada: hereda la marca (no hay nada nuevo que juzgar).
    await db.query(
      `UPDATE ml_preguntas SET ia_auto = ia_auto || jsonb_build_object('eco55', $2::jsonb ||
         CASE WHEN ia_auto->'eco'->>'marca' IS NOT NULL AND btrim(ia_auto->'eco'->>'respuesta') = btrim($3)
              THEN jsonb_build_object('marca', ia_auto->'eco'->>'marca', 'heredada', true) ELSE '{}'::jsonb END)
       WHERE id = $1`, [id, JSON.stringify(eco), eco.respuesta ?? ''])
  } catch (e) {
    console.error('[ia eco55]', id, e instanceof Error ? e.message : e)
    await db.query(`UPDATE ml_preguntas SET ia_auto = ia_auto || jsonb_build_object('eco55', $2::jsonb) WHERE id = $1`,
      [id, JSON.stringify({ error: (e instanceof Error ? e.message : String(e)).slice(0, 200) })]).catch(() => {})
  }
}

/** Prueba de Haiku 5.5 sobre lo ya procesado por la económica (primero las marcadas por el dueño). */
export async function repasarEco55(db: Pool, country: string, n: number) {
  const { rows } = await db.query(
    `SELECT id::text, item_estado FROM ml_preguntas
     WHERE ia_auto->'eco'->>'decision' IS NOT NULL AND NOT ia_auto ? 'eco55'
     ORDER BY (ia_auto->'eco'->>'marca' IS NOT NULL) DESC, fecha DESC LIMIT $1`, [n])
  for (const q of rows) {
    const c = await armarContexto(db, Number(q.id), country).catch(() => null)
    if (c) await simularEco55(db, q.id, c, c.item?.status ?? q.item_estado)
  }
  return rows.length
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


// ── Corrector (12-11, idea del dueño; medido con 90 frenadas: 61 salían solas, ~97 % bien) ───────────────────────────
// Si la respuesta quedó frenada SOLO por cosas que se arreglan escribiendo (dato que no está, forma, vacía), la IA la
// reescribe con lo que encontró el revisor; la nueva vuelve a pasar por el verificador y por todos los frenos. Lo demás
// (tope, pagos, montos, compatibilidad, posventa, publicación pausada…) no se corrige: lo ve una persona.
const ARREGLABLE = /^(Confianza (baja|media)|La IA no propuso respuesta|Dice que no hay|No está en los datos|Falta contestar|Habla como un tercero|Promete verificar|La respuesta no le habla|Recomienda otra publicación|La IA devolvió texto inválido)/
export const corregible = (motivos: string[]) => motivos.length > 0 && motivos.every(m => ARREGLABLE.test(m))
const MINIMO = /m[ií]nimo|\b(desde|a partir de) (2|dos|3|tres) (unidades|piezas)/i
const PIDE_COMPAT = /\bsirve|compatib|funciona (con|en|para)|le (queda|sirve)|aplica (para|a|en)|es para (un|una|mi)\b|para (un|una|mi) [a-z]/i
/** Lo que queda de la respuesta sin saludo, despedida ni "no tenemos ese dato": ¿aporta algo? */
function soloSinDato(r: string) {
  const resto = r.split(/(?<=[.;!?])\s+|,\s+(?=quedo|quedamos)/i)
    .map(f => f.replace(/^\s*buen[oa]?s?( (d[ií]as|tardes|noches))?[,!.\s]*/i, '').trim())
    .filter(f => f && !/quedo|quedamos|a (su|tu) orden|no (lo |la |los |las )?tenemos|dato/i.test(f))
  return resto.join(' ').split(/\s+/).filter(Boolean).length < 4
}

export async function corregirPregunta(c: Contexto, b: { respuesta: string; confianza: string; falta_dato: string | null; verificacion: string | null },
  motivos: string[], itemEstado: string | null): Promise<{ b: { respuesta: string; confianza: 'alta' | 'media' | 'baja'; falta_dato: string | null; verificacion: string | null; corregida: true; original: string }; motivos: string[]; llamadas: LlamadaIA[] } | null> {
  if (!corregible(motivos)) return null
  const k = await corregirBorrador(c, b.respuesta, motivos).catch(() => null)
  if (!k?.respuesta) return null
  const llamadas: LlamadaIA[] = [k.llamada]
  const v = await verificarBorrador(bloqueContexto(c), c.pregunta.texto, k.respuesta, undefined, true, true).catch(() => null)
  if (v) llamadas.push(v.llamada)
  const nb = { respuesta: k.respuesta, confianza: k.confianza, falta_dato: k.falta_dato, verificacion: v ? (v.ok ? 'ok' : v.motivo) : null }
  const m2 = motivosRevisar(nb, itemEstado, c.pregunta.texto, datosPublicacion(c), true, textoVendedor(c), datosCompatibilidad(c))
  if (!v) m2.push('El verificador no respondió')
  if (MINIMO.test(b.respuesta) && !MINIMO.test(k.respuesta)) m2.push('La corrección quitó el mínimo de unidades del envío gratis')
  if (PIDE_COMPAT.test(c.pregunta.texto) && soloSinDato(k.respuesta)) m2.push('Pregunta si sirve y la respuesta solo dice que no tenemos el dato')
  return { b: { ...nb, corregida: true, original: b.respuesta }, motivos: m2, llamadas }
}
