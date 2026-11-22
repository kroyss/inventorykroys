// Mensajes con IA en MODO PRUEBA (06-11-2026, migración 145, pedido del dueño). Solo empresas con el módulo `mensajes_ia`.
// Cuando llega un mensaje nuevo de un comprador (la conversación queda con el último mensaje del comprador), la IA escribe
// la respuesta con borradorMensaje (lib/mensajesIA.ts, la misma del botón) y decide si habría salido SOLA o a REVISIÓN.
// NO manda nada: queda como borrador en la conversación (lo encuentra escrito quien la abre) y en Mensajes → IA en prueba
// para marcar Bien / Mal. Una por mensaje del comprador (varios seguidos = uno: se espera ESPERA_MIN sin mensajes nuevos).
// La propietaria (SolucionesMC) lo corre siempre como prueba interna y no descuenta créditos ('simulacion').
// CLIENTES (09-11, mig. 158): solo con el automático ENCENDIDO (Mi IA) y cada respuesta usa 1 crédito ('mensajes');
// sin créditos no procesa. Los que no salen solos quedan escritos en la conversación para el equipo.
import type { Pool } from 'pg'
import { borradorMensaje, type OpcionesMensaje } from '@/lib/mensajesIA'
import { verificarMensaje } from '@/lib/verificadorIA'
import type { LlamadaIA } from '@/lib/ia'
import { textoPlano } from '@/lib/mensajesML'
import { costoDe, cupoIA, registrarUso, iaConfigurada } from '@/lib/ia'
import { problemasDelTexto } from '@/lib/preguntasTexto'
import { leerMiIA, MI_IA_KEY } from '@/lib/miIA'
import { responderHilo } from '@/lib/mensajesML'
import { leerFrenos, motivosFrenos } from '@/lib/iaFrenos'
import { copiarNotas, crearNota, editarNota, leerNotas, unirNotas, LARGO_NOTA } from '@/lib/notasML'

// AUTOMÁTICO (07-11, mig 149, pedido del dueño: las de confianza alta venían bien): con 'mensajes_ia_auto' = {"modo":"real"}
// las de decisión 'sola' se MANDAN. Antes de mandar se confirma que la conversación sigue esperando al vendedor (nadie del
// equipo contestó) y que no llegó otro mensaje del comprador después (ese se contesta en la pasada siguiente, junto).
export const CLAVE_AUTO = 'mensajes_ia_auto'
async function autoReal(db: Pool) {
  const { rows: [r] } = await db.query(`SELECT value FROM app_settings WHERE key = $1`, [CLAVE_AUTO])
  try { return JSON.parse(r?.value ?? '{}').modo === 'real' } catch { return false }
}
// 10-11 (el dueño, mig 163): «Responder todo» = sin modo seguro, manda también lo que iría a revisión (solo respeta los
// frenos del vendedor: horario y máximo por comprador). Independiente de Preguntas.
export async function autoTodo(db: Pool) {
  const { rows: [r] } = await db.query(`SELECT value FROM app_settings WHERE key = $1`, [CLAVE_AUTO])
  try { const v = JSON.parse(r?.value ?? '{}'); return v.modo === 'real' && v.todo === true } catch { return false }
}

export const CLAVE_DESDE = 'mensajes_ia_desde'
async function encendidoDesde(db: Pool) {
  const { rows: [r] } = await db.query(`SELECT value FROM app_settings WHERE key = $1`, [CLAVE_AUTO])
  try { return JSON.parse(r?.value ?? '{}').at ?? new Date().toISOString() } catch { return new Date().toISOString() }
}
const ESPERA_MIN = 2          // el comprador suele mandar 2 o 3 mensajes seguidos: se contesta al último
const HORAS_MAX = 24          // uno más viejo ya lo está viendo una persona
const POR_PASADA = 3

// Siempre los ve una persona (lo que escribió el COMPRADOR).
const RECLAMO = /reclam|devol|reembols|cancel|anul|garant[ií]a|defect|da[ñn]ad|rot[oa]\b|no (me )?(lleg|funciona|sirve|enciende|carga|prende)|no (es|era) (lo que|el que|la que)|equivocad|incomplet|mal estado|estafa|denunci|queja|molest|no quiero nada|ya no (lo |la |los |las )?quiero|no (lo |la )?voy a (querer|comprar|recibir)|desist|me arrepent/i
// 21-11 (medición): «No quiero nada» = quería cancelar y la IA contestó «con gusto». Ahora también lo ve una persona.
const PAGO = /comprobante|capture|captura|referencia|ya (pagu|transfer|hice el pago|deposit)|pagu[eé]|transfer[ií]|pago m[oó]vil|zelle|binance|no (me )?(aparece|refleja)|cobr(o|aron) (de m[aá]s|doble)/i
const DATOS = /\b\d{7,}\b|\bc\.?\s?i\.?\b|c[eé]dula|direcci[oó]n|\bcalle\b|\bav(enida|\.)|\burb(anizaci[oó]n|\.)|\bsector\b|\bedificio\b|\bapto\b|tel[eé]fono/i
// Lo que dice la IA.
const MONTO = /\d[\d.,]*\s?(bs\b|bs\.|bol[ií]vares)|\bbs\.?\s?\d|aproximad/i
// 08-11: "no hay problema" no es decir que no hay producto.
const NEGATIVA = /\bno (lo |la |los |las )?(tenemos|tengo|hay(?! (ning[uú]n )?(problema|inconveniente|rollo|drama))|queda|quedan)\b|agotad|sin (stock|existencia)/i
// 08-11 (el dueño): un monto que el VENDEDOR ya escribió en la conversación (ej. "400Bs de embalaje") no es un estimado
// de la IA: no frena. Frena si la IA da un monto que no está escrito por el vendedor, o si dice "aproximado".
const montosBs = (t: string) => [...t.matchAll(/(\d[\d.,]*)\s?(?:bs\b|bs\.|bol[ií]vares)|\bbs\.?\s?(\d[\d.,]*)/gi)]
  .map(m => (m[1] ?? m[2] ?? '').replace(/[.,]+$/, ''))
function montoInventado(respuesta: string, vendedor: string) {
  if (/aproximad/i.test(respuesta)) return true
  const dichos = new Set(montosBs(vendedor))
  return montosBs(respuesta).some(n => !dichos.has(n))
}

// Pedido especial (08-11, el dueño): pide otro color/variante, mezclar, otra cantidad u otro producto. No sale nada solo
// (ni la frase de escape): queda el borrador para la persona y una nota en la venta de ML ("PEDIDO ESPECIAL - verificar: …")
// que el equipo ve en Ventas y Despachos antes de enviar. Lo detecta la IA (no palabras sueltas, para no frenar de más).
export const PEDIDO_ESPECIAL = 'Pedido especial'
// Reclamos (devolución, garantía, reemplazo, dañado, envío equivocado) ya iban siempre a una persona (RECLAMO); ahora
// también dejan su nota "RECLAMO - verificar: …" para que el reemplazo o la devolución no se pierdan en el chat.
// 21-11: los acuses (v2) dejan su nota igual: PAGO / DATOS / ARCHIVO - verificar.
const PREFIJOS = { pedido: 'PEDIDO ESPECIAL', reclamo: 'RECLAMO', pago: 'PAGO', datos: 'DATOS', archivo: 'ARCHIVO' } as const

async function notaVerificar(db: Pool, conexionId: number, pack: string, tipo: keyof typeof PREFIJOS, resumen: string) {
  const texto = `${PREFIJOS[tipo]} - verificar: ${resumen}`.slice(0, LARGO_NOTA)
  const { notas, error } = await leerNotas(db, conexionId, pack)
  if (error) throw new Error(error)
  const previa = notas.find(n => n.texto.trim().toUpperCase().startsWith(`${PREFIJOS[tipo]} - VERIFICAR`))
  if (previa?.texto.trim() === texto) return
  if (previa) await editarNota(db, conexionId, pack, previa, texto)
  else await crearNota(db, conexionId, pack, texto)
  const r = await leerNotas(db, conexionId, pack)
  const todas = r.notas.some(n => n.texto.trim() === texto) ? r.notas
    : [...r.notas.filter(n => n.id !== previa?.id), { id: 'pendiente', texto, fecha: new Date().toISOString(), fuente: 'orden' as const }]
  await copiarNotas(db, pack, todas)
  await db.query(`UPDATE sales SET notes = $2, updated_at = NOW() WHERE ml_order_number = $1`, [pack, unirNotas(todas)])
}

/** Por qué NO saldría sola (vacío = saldría sola). */
export function motivosMensaje(b: { respuesta: string; confianza: string; falta_dato: string | null; pedido_especial?: string | null; reclamo?: string | null }, comprador: string, persona: string[] = [], vendedor = ''): string[] {
  const m: string[] = []
  if (b.pedido_especial) m.push(`${PEDIDO_ESPECIAL}: ${b.pedido_especial}`)
  if (b.reclamo && !RECLAMO.test(comprador)) m.push(`Reclamo: ${b.reclamo}`)
  if (RECLAMO.test(comprador)) m.push('Reclamo, cancelación o devolución: lo ve una persona')
  if (PAGO.test(comprador) && !/embalaje|adicional/i.test(comprador)) m.push('Habla de un pago o comprobante: lo verifica una persona')
  if (DATOS.test(comprador)) m.push('Manda datos personales o de envío: lo ve una persona')
  const tema = persona.find(t => t.length >= 4 && comprador.toLowerCase().includes(t.toLowerCase().split(' ')[0]))
  if (tema) m.push(`Tema que en Mi IA marcaste para una persona (${tema})`)
  if (!b.respuesta) { if (b.confianza !== 'alta') m.push('La IA no propuso respuesta'); return m }
  if (b.confianza !== 'alta') m.push(`Confianza ${b.confianza}${b.falta_dato ? `: ${b.falta_dato}` : ''}`)
  if (MONTO.test(b.respuesta) && montoInventado(b.respuesta, vendedor)) m.push('Da un monto en bolívares o un estimado')
  if (NEGATIVA.test(b.respuesta)) m.push('Dice que no hay: lo confirma una persona')
  const p = problemasDelTexto(b.respuesta, 'mensaje')
  if (p.length) m.push(`MercadoLibre la borraría: ${p.join(', ')}`)
  return m
}

// 12-11 (corrector): frenado SOLO por confianza, vacío o "no hay" → la IA lo reescribe con el motivo. Mensajes no tiene
// verificador: la corregida sale solo si la IA queda con confianza ALTA y sin ningún otro freno (reclamo, pago, datos…).
const ARREGLABLE_MSG = /^(Confianza (baja|media)|La IA no propuso respuesta|Dice que no hay)/
export const CORREGIR_MENSAJES = false
export const mensajeCorregible = (motivos: string[]) => motivos.length > 0 && motivos.every(m => ARREGLABLE_MSG.test(m))

/** Lo llama el cron cada minuto. `cliente` = no es la propietaria (solo encendido y con créditos). */
export async function procesarMensajesIA(db: Pool, country: string, conInventario: boolean, cliente = false, empresaId = 0) {
  if (!iaConfigurada()) return null
  if (cliente) {
    if (!(await autoReal(db))) return null
    if ((await cupoIA(db, empresaId)).agotado) return null
  }
  const { rows: [d] } = await db.query(`SELECT value FROM app_settings WHERE key = $1`, [CLAVE_DESDE])
  // Clientes: desde que lo encendieron (no se contestan mensajes viejos).
  const desde = cliente ? await encendidoDesde(db) : d?.value ?? new Date().toISOString()
  // Conversaciones cuyo último mensaje es del comprador, quieto hace ESPERA_MIN, y sin borrador para ese mensaje.
  const { rows } = await db.query(
    `WITH c AS (
       SELECT c.pack_id, c.conexion_id, c.ultimo_at, x.ml_user_id FROM ml_conversaciones c
       JOIN ml_conexiones x ON x.id = c.conexion_id AND x.estado = 'activa'
       WHERE c.ultimo_de_comprador AND c.ultimo_at >= $1::timestamptz
         AND c.ultimo_at > NOW() - make_interval(hours => $2) AND c.ultimo_at < NOW() - make_interval(mins => $3)
         AND NOT EXISTS (SELECT 1 FROM ml_mensajes_ia i WHERE i.pack_id = c.pack_id AND i.mensaje_at >= c.ultimo_at)
       ORDER BY c.ultimo_at LIMIT $4)
     INSERT INTO ml_mensajes_ia (pack_id, conexion_id, mensaje_at)
     SELECT pack_id, conexion_id, ultimo_at FROM c
     ON CONFLICT (empresa_id, pack_id, mensaje_at) DO NOTHING
     RETURNING id, pack_id::text, conexion_id, mensaje_at, (SELECT ml_user_id FROM ml_conexiones WHERE id = conexion_id) AS seller`,
    [desde, HORAS_MAX, ESPERA_MIN, POR_PASADA])
  if (!rows.length) return null
  const { rows: [mi] } = await db.query(`SELECT value FROM app_settings WHERE key = $1`, [MI_IA_KEY])
  const persona = leerMiIA(mi?.value)?.persona ?? []
  const real = await autoReal(db)
  const todo = real && await autoTodo(db)
  // Frenos (07-11, lib/iaFrenos.ts): horario y tope por comprador, y la frase de escape. Solo en modo real.
  const frenos = real ? await leerFrenos(db) : null
  let listos = 0, errores = 0, enviadas = 0, escapes = 0
  const tono = leerMiIA(mi?.value)?.tono
  for (const r of rows) {
    try {
      // 21-11 (el dueño: «hazlo y a producción para mi equipo»): la propietaria usa Mensajes v2 (preguntas previas,
      // ejemplos por paso, verificador, corrector, frenos de forma y acuses con nota). Los clientes siguen como antes.
      if (!cliente) {
        const x = await procesarV2(db, r, country, conInventario, persona, tono, frenos, real, todo)
        enviadas += x.enviada; escapes += x.escape; listos++
        continue
      }
      // borradorMensaje relee la conversación en ML (y la guarda): después se toma lo que escribió el comprador desde el
      // último mensaje del vendedor (los seguidos, juntos).
      let b = await borradorMensaje(db, r.conexion_id, Number(r.seller), r.pack_id, country, conInventario)
      const { rows: msgs } = await db.query(
        `SELECT propio, texto FROM ml_mensajes WHERE pack_id = $1 ORDER BY fecha DESC LIMIT 10`, [r.pack_id])
      const corte = msgs.findIndex(m => m.propio)
      const comprador = (corte < 0 ? msgs : msgs.slice(0, corte)).reverse().map(m => String(m.texto)).join('\n').slice(0, 1000)
      const vendedor = msgs.filter(m => m.propio).map(m => String(m.texto)).join('\n')
      let motivos = motivosMensaje(b, comprador, persona, vendedor)
      let corregida: string | null = null
      // 12-11: la corrección en Mensajes quedó APAGADA (medida: 3 de 50 salían; no paga lo que cuesta). Se enciende con CORREGIR_MENSAJES.
      if (CORREGIR_MENSAJES && mensajeCorregible(motivos)) {
        const k = await borradorMensaje(db, r.conexion_id, Number(r.seller), r.pack_id, country, conInventario, undefined,
          { anterior: b.respuesta, problemas: motivos }).catch(() => null)
        if (k) {
          await registrarUso(db, cliente ? 'mensajes' : 'simulacion', [{ modelo: k.modelo, uso: k.uso }], null)
          const m2 = motivosMensaje(k, comprador, persona, vendedor)
          if (!m2.length && k.respuesta) { corregida = b.respuesta; b = k; motivos = m2 }
        }
      }
      let topeOHorario: string[] = []
      if (frenos) {
        const { rows: [cv] } = await db.query(`SELECT comprador_id::text FROM ml_conversaciones WHERE pack_id = $1`, [r.pack_id])
        topeOHorario = await motivosFrenos(db, frenos, country, 'mensajes', cv?.comprador_id ?? null)
        motivos.push(...topeOHorario)
      }
      const sinSeguro = todo && !!b.respuesta && motivos.length > 0 && !topeOHorario.length
      const decision = !b.respuesta && b.confianza === 'alta' && !motivos.length ? 'nada' : motivos.length && !sinSeguro ? 'revisar' : 'sola'
      await registrarUso(db, cliente ? 'mensajes' : 'simulacion', [{ modelo: b.modelo, uso: b.uso }], null)
      await db.query(
        `UPDATE ml_mensajes_ia SET estado = 'listo', comprador = $2, respuesta = $3, confianza = $4, falta_dato = $5,
           decision = $6, motivos = $7, modelo = $8, costo = $9, sin_seguro = $10 WHERE id = $1`,
        [r.id, comprador, b.respuesta || null, b.confianza, b.falta_dato, decision, motivos, b.modelo, costoDe(b.modelo, b.uso), sinSeguro])
      listos++
      for (const [tipo, resumen] of [['pedido', b.pedido_especial], ['reclamo', b.reclamo]] as const) {
        if (!resumen) continue
        try { await notaVerificar(db, r.conexion_id, r.pack_id, tipo, resumen) } catch (e) {
          const msg = (e instanceof Error ? e.message : String(e)).slice(0, 200)
          console.error('[mensajes ia nota]', tipo, r.pack_id, msg)
          await db.query(`UPDATE ml_mensajes_ia SET envio_error = $2 WHERE id = $1`, [r.id, `Nota de ${tipo === 'pedido' ? 'pedido especial' : 'reclamo'}: ${msg}`]).catch(() => {})
        }
      }
      if (real && decision === 'sola' && b.respuesta) {
        const { rows: [c] } = await db.query(
          `SELECT ultimo_de_comprador AND ultimo_at <= $2::timestamptz AS espera FROM ml_conversaciones WHERE pack_id = $1`,
          [r.pack_id, r.mensaje_at])
        if (c?.espera) {
          try {
            await responderHilo(db, r.conexion_id, r.pack_id, b.respuesta)
            await db.query(`UPDATE ml_mensajes_ia SET enviada_at = NOW() WHERE id = $1`, [r.id])
            enviadas++
          } catch (e) {
            const msg = (e instanceof Error ? e.message : String(e)).slice(0, 200)
            console.error('[mensajes ia auto]', r.pack_id, msg)
            await db.query(`UPDATE ml_mensajes_ia SET envio_error = $2 WHERE id = $1`, [r.id, msg]).catch(() => {})
          }
        }
      }
      // Frase de escape: no salió sola, hay algo que contestar y no se frenó por el tope. Una por conversación cada 24 h.
      // Sin marcarla como leída: sigue en «Por atender» y el equipo encuentra el borrador de la IA escrito.
      const porTope = topeOHorario.some(t => t.startsWith('Este comprador'))
      if (real && frenos?.escape && decision === 'revisar' && !porTope && !b.pedido_especial && !b.reclamo) {
        const { rows: [c] } = await db.query(
          `SELECT ultimo_de_comprador AND ultimo_at <= $2::timestamptz AS espera,
                  EXISTS (SELECT 1 FROM ml_mensajes_ia WHERE pack_id = $1 AND escape_at > NOW() - INTERVAL '24 hours') AS ya
           FROM ml_conversaciones WHERE pack_id = $1`, [r.pack_id, r.mensaje_at])
        if (c?.espera && !c.ya) {
          try {
            await responderHilo(db, r.conexion_id, r.pack_id, frenos.escape, true)
            await db.query(`UPDATE ml_mensajes_ia SET escape_at = NOW() WHERE id = $1`, [r.id])
            escapes++
          } catch (e) {
            const msg = (e instanceof Error ? e.message : String(e)).slice(0, 200)
            console.error('[mensajes ia escape]', r.pack_id, msg)
            await db.query(`UPDATE ml_mensajes_ia SET envio_error = $2 WHERE id = $1`, [r.id, `Frase de escape: ${msg}`]).catch(() => {})
          }
        }
      }
    } catch (e) {
      errores++
      const msg = (e instanceof Error ? e.message : String(e)).slice(0, 200)
      console.error('[mensajes ia]', r.pack_id, msg)
      await db.query(`UPDATE ml_mensajes_ia SET estado = 'error', error = $2 WHERE id = $1`, [r.id, msg]).catch(() => {})
    }
  }
  return { listos, errores, enviadas, escapes }
}

/** El borrador de la IA para el último mensaje del comprador de una conversación (si lo hay y nadie contestó). */
export async function borradorPrueba(db: Pool, pack: string) {
  const { rows: [b] } = await db.query(
    `SELECT i.respuesta, i.confianza, i.falta_dato, i.decision, i.motivos FROM ml_mensajes_ia i
     JOIN ml_conversaciones c ON c.pack_id = i.pack_id
     WHERE i.pack_id = $1 AND i.estado = 'listo'
       AND ((c.ultimo_de_comprador AND i.mensaje_at >= c.ultimo_at)
            -- Se mandó la frase de escape y nadie más escribió después: el borrador sigue sirviendo para el equipo.
            OR (i.escape_at IS NOT NULL AND c.ultimo_at <= i.escape_at + INTERVAL '2 minutes'))
     ORDER BY i.mensaje_at DESC LIMIT 1`, [pack])
  return b ?? null
}

/** Para Mensajes → IA en prueba: los casos con lo que respondió el equipo después, y el resumen. */
export async function listaPrueba(db: Pool) {
  const { rows } = await db.query(
    `SELECT i.id::text, i.pack_id::text, i.mensaje_at, i.comprador, i.estado, i.respuesta, i.confianza, i.decision, i.motivos,
            i.error, i.marca, i.enviada_at, i.escape_at, i.envio_error, i.sin_seguro, c.comprador_nombre, c.comprador_nick, c.productos, x.nickname AS cuenta,
            (SELECT string_agg(m.texto, E'\\n' ORDER BY m.fecha) FROM (
               SELECT texto, fecha FROM ml_mensajes m WHERE m.pack_id = i.pack_id AND m.propio AND m.fecha > i.mensaje_at
               ORDER BY fecha LIMIT 2) m) AS equipo
     FROM ml_mensajes_ia i
     LEFT JOIN ml_conversaciones c ON c.pack_id = i.pack_id
     LEFT JOIN ml_conexiones x ON x.id = i.conexion_id
     ORDER BY i.mensaje_at DESC LIMIT 300`)
  // Publicaciones que se contradicen (fotos / ficha / descripción, mig 146). 09-11: primero las que más preguntas
  // reciben (90 días), para corregir las que importan; se resuelven desde la lista (api/mensajes/ia-prueba/contradiccion).
  const { rows: contradicciones } = await db.query(
    `SELECT f.item_id, COALESCE(c.titulo, f.item_id) AS titulo, c.permalink, f.contradicciones, f.leido_at,
            (SELECT count(*)::int FROM ml_preguntas p WHERE p.item_id = f.item_id AND p.fecha > NOW() - INTERVAL '90 days') AS preguntas
     FROM ml_item_fotos_ia f LEFT JOIN ml_catalogo c ON c.item_id = f.item_id
     WHERE f.contradicciones IS NOT NULL ORDER BY preguntas DESC, f.leido_at DESC LIMIT 100`).catch(() => ({ rows: [] }))
  const listos = rows.filter(r => r.estado === 'listo')
  const solas = listos.filter(r => r.decision === 'sola')
  const marcadas = listos.filter(r => r.marca)
  return {
    casos: rows, contradicciones,
    resumen: {
      total: listos.length, solas: solas.length, revisar: listos.filter(r => r.decision === 'revisar').length,
      nada: listos.filter(r => r.decision === 'nada').length,
      marcadas: marcadas.length, bien: marcadas.filter(r => r.marca === 'bien').length,
      solasMarcadas: solas.filter(r => r.marca).length, solasBien: solas.filter(r => r.marca === 'bien').length,
    },
  }
}

// ── Mensajes v2 (21-11, el dueño: «haslo y mide»; luego «hazlo y a producción para mi equipo»). La usa el automático
// de la propietaria (procesarV2) y la medición (scripts/medir-mensajes-v2.ts). Igual que Preguntas:
//   1. borrador con las preguntas previas del comprador y ejemplos del mismo paso (de la IA solo los que salieron bien);
//   2. verificador de Mensajes (datos + que encaje con la conversación): si aprueba, la confianza media/baja ya no frena;
//   3. si quedó frenada solo por cosas de forma (confianza, vacía, "no hay", verificador), la IA la corrige y vuelve a pasar todo;
//   4. un «Pedido especial» ya anotado antes en esta conversación no vuelve a frenar los mensajes siguientes ("ok", "ya pagué").
// 21-11 (nivel 2, acuse seguro): si lo ÚNICO que frena es que el comprador manda un comprobante/pago o sus datos de envío
// (sin reclamo, pedido especial ni pregunta), sale un texto FIJO que solo acusa recibo («lo verificamos y le confirmamos
// por aquí»): nunca dice recibido ni confirmado, y el caso queda «Por confirmar» para el equipo.
const ACUSE_FRENOS = /^(Habla de un pago o comprobante|Manda datos personales o de envío|Confianza (baja|media)|Verificador:|La IA no propuso respuesta|Da un monto|Da un pago por recibido|Forma:)/
export type Acuse = 'pago' | 'datos' | 'archivo'
// 21-11 (medición de 120): «envíeme el pago móvil», «me facilita los datos» = PIDE datos (no mandó nada); «favor pasar
// comprobante» = nos pide un comprobante a nosotros. Ninguno de los dos es un acuse.
export const PIDE_DATOS = /(env[ií](e|a|ar)(me)?|p[aá]s(e|a|ar)(me)?|facilit|ind[ií]que(me)?|me (da|das|puede dar|indica)|cu[aá]les son|a qu[eé])\b[^.\n]{0,40}(datos|pago ?m[oó]vil|pm\b|cuenta|n[uú]mero|comprobante|capture|gu[ií]a)|datos (del |de |para )?(el )?(pago|pagom[oó]vil|pago m[oó]vil)|c[oó]mo (le )?(hago|pago|procedo)/i
const MANDO_ALGO = /adjunt|capture|captura|comprobante|referencia|operaci[oó]n|ya (le )?(pagu|transfer|hice el pago|deposit|realic)|pagu[eé]|transfer[ií]|realic[eé] (el )?pago|ah[ií] (va|est[aá]|el pago|le)/i
const PAGO_DADO = /\brecibid[oa]\b|pago (ya )?(est[aá] |fue |qued[oó] )?(confirmad|recibid|verificad|acreditad)|confirmamos (su|el) pago|ya (nos )?lleg[oó] (su|el) pago/i
// 21-11 (afinado, medición de 120): frenos sobre el TEXTO de la IA para lo que sí sale solo. Todos son de forma: el
// corrector la reescribe una vez; si vuelve a fallar, la ve una persona.
const TERCERA = /\b(el|la|al|del) (comprador|compradora|cliente|vendedor|vendedora)\b/i
const ROBOT = /no est[aá] en (mis|los|nuestros) datos|seg[uú]n (los|mis) datos|(su|el) [uú]ltimo mensaje (de usted )?fue|queda registrado (su|el) mensaje/i
const DICE_PAGADO = /ya est[aá] pagad|compra (ya )?(est[aá] )?pagad|su pago (ya )?(figura|aparece|est[aá] registrad|qued[oó] registrad|est[aá] en mercado ?env)|pago ya (est[aá] )?(registrad|en mercado ?env|figura|aparece)/i
// «ya realizo el pago», «ahorita le transfiero» = VA a pagar (en Venezuela «ya realizo» suele ser «ahora lo hago»): no hay
// nada que acusar todavía.
const VA_A_PAGAR = /ya (le )?(realizo|hago|pago|transfiero|deposito)\b|ahorita (le )?(pago|transfiero|hago|realizo)|voy a (pagar|transferir|hacer el pago|realizar el pago)|en un (rato|momento) (le )?(pago|transfiero)/i
const PROMETE = /\ble (compartimos|enviamos|mandamos|pasamos|env[ií]o|comparto|mando|paso)\b[^.]{0,40}(contacto|n[uú]mero|tel[eé]fono|foto|link|enlace|whats)/i
const LLEGADA = /(tarda|tardan|demora|demoran|llega|llegan|llegar[ií]a|recibe|recibir[ií]a)\b[^.]{0,50}\b(\d+|uno|dos|tres|cuatro|cinco)\s*(a|-|y|o)?\s*(\d+|dos|tres|cuatro|cinco)?\s*d[ií]as|normalmente (tarda|llega|demora)/i
const LLEGADA_DIAS = /\b\d+\s*(a|-|y)?\s*\d*\s*d[ií]as/i
// 21-11: en postventa, el precio de OTRO producto abre un pedido nuevo: lo ve una persona (no se corrige).
export const PRECIO_OTRO = 'Precio de otro producto: lo ve una persona'
const PIDE_PRECIO = /precio|costo|cu[aá]nto (cuesta|sale|es|vale|cobra)/i
const MONTO_USD = /(\d[\d.,]*)\s*(usd|\$|d[oó]lares)|\$\s*(\d[\d.,]*)/gi
const CORTESIA = /^(hola|buenas|buenos d[ií]as|buenas (tardes|noches)|ok|okey|oki|okay|listo|perfecto|gracias|muchas gracias|excelente|de acuerdo|vale|dale|bendiciones|am[eé]n|dios (le|te) bendiga|saludos|feliz d[ií]a|amigo|hermano|\s|[.,!¡]|[^\p{L}\p{N}])+$/iu
export function problemasForma(respuesta: string, comprador: string, contexto: string): string[] {
  const p: string[] = []
  if (!respuesta) return p
  if (TERCERA.test(respuesta)) p.push('Forma: habla en tercera persona')
  if (ROBOT.test(respuesta)) p.push('Forma: frase de robot')
  if (DICE_PAGADO.test(respuesta) && !/^PAGO: ya pagó/m.test(contexto)) p.push('Forma: dice que está pagado sin que el sistema lo diga')
  if (PROMETE.test(respuesta) && !/\d{4,}|https?:/.test(respuesta)) p.push('Forma: promete mandar algo que no va en el mensaje')
  // 21-11 (igual que Preguntas): días de llegada solo si están en las POLÍTICAS (Mi IA); los ejemplos viejos no valen.
  const pol = contexto.slice(contexto.indexOf('POLÍTICAS DEL VENDEDOR:'))
  if (LLEGADA.test(respuesta) && !(contexto.includes('POLÍTICAS DEL VENDEDOR:') && LLEGADA_DIAS.test(pol))) p.push('Forma: da días de llegada que no están en Mi IA')
  const c = comprador.trim()
  if (c && c.length <= 40 && CORTESIA.test(c)) {
    if (respuesta.length > 140 || /embalaje|pago m[oó]vil|formulario|datos para pagar|medidas?\b/i.test(respuesta)) p.push('Forma: contesta de más a un saludo o un «ok»')
    // 21-11 (afinado 2): a un «gracias» no se lamenta ni se disculpa, y no se reabre lo ya respondido (color, cambio, cantidad).
    if (/lamentablemente|disculpe|lo sentimos|lamentamos/i.test(respuesta)) p.push('Forma: se lamenta o disculpa ante un saludo o un «ok»')
    if (/(verificamos|confirmamos|revisamos)[^.]{0,40}(distribuci|cambio|color|talla|pedido|cantidad|unidades)/i.test(respuesta)) p.push('Forma: reabre algo ya respondido ante un «ok»')
  }
  return p
}
const mayuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
// La nota («PAGO / DATOS / ARCHIVO - verificar: …») va en la venta de ML, igual que PEDIDO ESPECIAL y RECLAMO: el equipo la
// ve en Ventas y Despachos y el paquete no sale sin que alguien lo revise.
export function acuseSeguro(motivos: string[], comprador: string, tono?: { saludo?: string; despedida?: string }): { tipo: Acuse; texto: string; nota: string } | null {
  if (!motivos.length || !motivos.every(m => ACUSE_FRENOS.test(m))) return null
  const c = comprador.trim()
  const pago = motivos.some(m => m.startsWith('Habla de un pago')), datos = motivos.some(m => m.startsWith('Manda datos'))
  let tipo: Acuse | null
  if (!c) tipo = 'archivo'   // solo mandó un archivo o una foto, sin texto
  else {
    // Mensajes largos suelen traer algo más (otra pregunta, un pedido): esos los ve una persona.
    if ((!pago && !datos) || /\?|¿/.test(c) || c.length > 160 || PIDE_DATOS.test(c) || VA_A_PAGAR.test(c)) return null
    // Una referencia, un número de operación o el pago del embalaje = comprobante (aunque solo sean números).
    tipo = MANDO_ALGO.test(c) || (/embalaje/i.test(c) && /\d{4,}/.test(c)) ? 'pago' : datos ? 'datos' : null
    if (!tipo) return null
  }
  const saludo = (tono?.saludo?.trim() || 'Buenas').replace(/[.,!]+$/, ''), despedida = mayuscula(tono?.despedida?.trim() || 'Quedo a su orden.')
  const texto = tipo === 'pago' ? `${saludo}, recibimos su comprobante. Lo verificamos y le confirmamos por aquí. ${despedida}`
    : tipo === 'datos' ? `${saludo}, recibimos sus datos. Los revisamos y le confirmamos por aquí. ${despedida}`
    : `${saludo}, recibimos su archivo. Lo revisamos y le confirmamos por aquí. ${despedida}`
  const nota = tipo === 'archivo' ? 'ARCHIVO - verificar: mandó un archivo o una foto sin texto'
    : `${tipo === 'pago' ? 'PAGO' : 'DATOS'} - verificar: ${c.replace(/\s+/g, ' ').slice(0, 140)}`
  return { tipo, texto, nota }
}

/** Lo que escribió el comprador desde la última respuesta propia y todo lo del vendedor, hasta ese momento (prueba de Mi IA). */
export async function textosHasta(db: Pool, pack: string, hasta: string) {
  const { rows: msgs } = await db.query(
    `SELECT propio, texto FROM ml_mensajes WHERE pack_id = $1 AND fecha <= $2::timestamptz + interval '1 second' ORDER BY fecha DESC LIMIT 10`, [pack, hasta])
  const corte = msgs.findIndex(m => m.propio)
  const comprador = (corte < 0 ? msgs : msgs.slice(0, corte)).reverse().map(m => String(m.texto)).join(NL).slice(0, 1000)
  const vendedor = msgs.filter(m => m.propio).map(m => String(m.texto)).join(NL)
  return { comprador, vendedor }
}

type FilaMensaje = { id: string; pack_id: string; conexion_id: number; mensaje_at: Date | string; seller: string | number }
const NL = '\n'
/** Un mensaje del automático con la v2 (solo la propietaria). Guarda, deja notas, envía y usa la frase de escape igual que antes. */
async function procesarV2(db: Pool, r: FilaMensaje, country: string, conInventario: boolean, persona: string[],
  tono: { saludo?: string; despedida?: string } | undefined, frenos: Awaited<ReturnType<typeof leerFrenos>> | null, real: boolean, todo: boolean) {
  let comprador = '', vendedor = ''
  const textos = async () => {
    const { rows: msgs } = await db.query(`SELECT propio, texto FROM ml_mensajes WHERE pack_id = $1 ORDER BY fecha DESC LIMIT 10`, [r.pack_id])
    const corte = msgs.findIndex(m => m.propio)
    comprador = (corte < 0 ? msgs : msgs.slice(0, corte)).reverse().map(m => String(m.texto)).join(NL).slice(0, 1000)
    vendedor = msgs.filter(m => m.propio).map(m => String(m.texto)).join(NL)
    return { comprador, vendedor }
  }
  const e = await evaluarMensajeV2(db, { conexionId: r.conexion_id, seller: Number(r.seller), pack: r.pack_id, country, conInventario,
    comprador, persona, vendedor, mensajeAt: new Date(r.mensaje_at).toISOString(), tono, textos })
  const b = e.b, motivos = [...e.motivos]
  await registrarUso(db, 'simulacion', e.llamadas, null)
  let topeOHorario: string[] = []
  if (frenos) {
    const { rows: [cv] } = await db.query(`SELECT comprador_id::text FROM ml_conversaciones WHERE pack_id = $1`, [r.pack_id])
    topeOHorario = await motivosFrenos(db, frenos, country, 'mensajes', cv?.comprador_id ?? null)
    motivos.push(...topeOHorario)
  }
  const sinSeguro = todo && !!b.respuesta && motivos.length > 0 && !topeOHorario.length
  const decision = !b.respuesta && b.confianza === 'alta' && !motivos.length ? 'nada' : motivos.length && !sinSeguro ? 'revisar' : 'sola'
  const costo = e.llamadas.reduce((s, l) => s + costoDe(l.modelo, l.uso), 0)
  await db.query(
    `UPDATE ml_mensajes_ia SET estado = 'listo', comprador = $2, respuesta = $3, confianza = $4, falta_dato = $5,
       decision = $6, motivos = $7, modelo = $8, costo = $9, sin_seguro = $10 WHERE id = $1`,
    [r.id, comprador, b.respuesta || null, b.confianza, b.falta_dato, decision, motivos, b.modelo, costo, sinSeguro])
  // Notas en la venta: pedido especial y reclamo (como antes), el precio de otro producto (= pedido) y el acuse.
  const notas: [keyof typeof PREFIJOS, string][] = []
  if (b.pedido_especial) notas.push(['pedido', b.pedido_especial])
  else if (motivos.includes(PRECIO_OTRO)) notas.push(['pedido', `pregunta el precio de otro producto: ${textoPlano(comprador).replace(/\s+/g, ' ').slice(0, 120)}`])
  if (b.reclamo) notas.push(['reclamo', b.reclamo])
  if (e.acuse && e.nota) notas.push([e.acuse, e.nota.replace(/^[A-Z ]+ - verificar: /, '')])
  for (const [tipo, resumen] of notas) {
    try { await notaVerificar(db, r.conexion_id, r.pack_id, tipo, resumen) } catch (err) {
      const msg = (err instanceof Error ? err.message : String(err)).slice(0, 200)
      console.error('[mensajes ia nota]', tipo, r.pack_id, msg)
      await db.query(`UPDATE ml_mensajes_ia SET envio_error = $2 WHERE id = $1`, [r.id, `Nota de ${PREFIJOS[tipo].toLowerCase()}: ${msg}`]).catch(() => {})
    }
  }
  let enviada = 0, escape = 0
  if (real && decision === 'sola' && b.respuesta) {
    const { rows: [c] } = await db.query(
      `SELECT ultimo_de_comprador AND ultimo_at <= $2::timestamptz AS espera FROM ml_conversaciones WHERE pack_id = $1`, [r.pack_id, r.mensaje_at])
    if (c?.espera) {
      try {
        await responderHilo(db, r.conexion_id, r.pack_id, b.respuesta)
        await db.query(`UPDATE ml_mensajes_ia SET enviada_at = NOW() WHERE id = $1`, [r.id])
        enviada = 1
      } catch (err) {
        const msg = (err instanceof Error ? err.message : String(err)).slice(0, 200)
        console.error('[mensajes ia auto]', r.pack_id, msg)
        await db.query(`UPDATE ml_mensajes_ia SET envio_error = $2 WHERE id = $1`, [r.id, msg]).catch(() => {})
      }
    }
  }
  // Frase de escape: igual que antes, y tampoco en el precio de otro producto (es un pedido).
  const porTope = topeOHorario.some(t => t.startsWith('Este comprador'))
  if (real && frenos?.escape && decision === 'revisar' && !porTope && !b.pedido_especial && !b.reclamo && !motivos.includes(PRECIO_OTRO)) {
    const { rows: [c] } = await db.query(
      `SELECT ultimo_de_comprador AND ultimo_at <= $2::timestamptz AS espera,
              EXISTS (SELECT 1 FROM ml_mensajes_ia WHERE pack_id = $1 AND escape_at > NOW() - INTERVAL '24 hours') AS ya
       FROM ml_conversaciones WHERE pack_id = $1`, [r.pack_id, r.mensaje_at])
    if (c?.espera && !c.ya) {
      try {
        await responderHilo(db, r.conexion_id, r.pack_id, frenos.escape, true)
        await db.query(`UPDATE ml_mensajes_ia SET escape_at = NOW() WHERE id = $1`, [r.id])
        escape = 1
      } catch (err) {
        const msg = (err instanceof Error ? err.message : String(err)).slice(0, 200)
        console.error('[mensajes ia escape]', r.pack_id, msg)
        await db.query(`UPDATE ml_mensajes_ia SET envio_error = $2 WHERE id = $1`, [r.id, `Frase de escape: ${msg}`]).catch(() => {})
      }
    }
  }
  return { enviada, escape }
}

export const OPCIONES_V2: OpcionesMensaje = { preguntasPrevias: true, ejemplos: { sinIA: true, porPaso: true } }
const CORREGIBLE_V2 = /^(Confianza (baja|media)|La IA no propuso respuesta|Dice que no hay|Da un pago por recibido|Forma:|Verificador: (No está en los datos|Falta contestar|No encaja))/
type BorradorV2 = Awaited<ReturnType<typeof borradorMensaje>>
export interface EvaluacionV2 {
  b: BorradorV2; motivos: string[]; verificacion: string | null
  corregida: boolean; original: string | null; pedidoRepetido: boolean; llamadas: LlamadaIA[]
  /** Nivel 2: salió el acuse fijo; el caso queda «Por confirmar» para el equipo con esta nota en la venta. */
  acuse: Acuse | null; nota?: string | null
}
export async function evaluarMensajeV2(db: Pool, a: { conexionId: number; seller: number; pack: string; country: string; conInventario: boolean;
  comprador: string; persona: string[]; vendedor: string; hasta?: string; historico?: boolean; mensajeAt: string
  tono?: { saludo?: string; despedida?: string }
  /** En el automático: lo que escribió el comprador se lee DESPUÉS del primer borrador (que relee la conversación en ML). */
  textos?: () => Promise<{ comprador: string; vendedor: string }> }): Promise<EvaluacionV2> {
  const op: OpcionesMensaje = { ...OPCIONES_V2, historico: a.historico }
  const llamadas: LlamadaIA[] = []
  const { rows: [prev] } = await db.query(
    `SELECT EXISTS (SELECT 1 FROM ml_mensajes_ia WHERE pack_id = $1 AND mensaje_at < $2::timestamptz
       AND EXISTS (SELECT 1 FROM unnest(motivos) m WHERE m LIKE 'Pedido especial%')) AS p`, [a.pack, a.mensajeAt])
  const pedidoAnotado = prev?.p === true
  const evaluar = async (b: BorradorV2) => {
    llamadas.push({ modelo: b.modelo, uso: b.uso })
    // 21-11: un monto que cuadra con el TOTAL de la venta o con el embalaje de Mi IA tampoco es inventado.
    const montosOk = b.contexto.split('\n').filter(l => /^(TOTAL DE LA VENTA|- Embalaje OPCIONAL)/.test(l)).join('\n')
    let m = motivosMensaje(b, a.comprador, a.persona, `${a.vendedor}\n${montosOk}`)
    // 21-11: pedir los datos para pagar no es «hablar de un pago» si Mi IA los tiene cargados: la IA los da (y el
    // verificador comprueba que estén copiados exactos).
    if (PIDE_DATOS.test(a.comprador) && /Datos para pagar \(cópialos EXACTOS/.test(b.contexto)) m = m.filter(x => !x.startsWith('Habla de un pago'))
    // Nunca dar un pago aparte por recibido o confirmado (eso lo hace una persona viendo la cuenta).
    if (b.respuesta && PAGO_DADO.test(b.respuesta)) m.push('Da un pago por recibido: lo confirma una persona')
    m.push(...problemasForma(b.respuesta, textoPlano(a.comprador), b.contexto))
    if (b.respuesta && PIDE_PRECIO.test(a.comprador)) {
      const total = b.contexto.split('\n').find(l => l.startsWith('TOTAL DE LA VENTA')) ?? ''
      const otros = [...b.respuesta.matchAll(MONTO_USD)].map(x => (x[1] ?? x[3] ?? '').replace(/[.,]+$/, '')).filter(n => n && !total.includes(n))
      if (otros.length) m.push(PRECIO_OTRO)
    }
    // Con un problema de forma ya hay que corregirla: no se gasta el verificador en esta versión.
    const deForma = m.some(x => /^(Forma:|Da un pago por recibido)/.test(x))
    let repetido = false
    if (pedidoAnotado && m.some(x => x.startsWith(PEDIDO_ESPECIAL))) { m = m.filter(x => !x.startsWith(PEDIDO_ESPECIAL)); repetido = true }
    let verificacion: string | null = null
    if (b.respuesta && !deForma) {
      const v = await verificarMensaje(b.contexto, textoPlano(a.comprador), b.respuesta).catch(() => null)
      if (v) { llamadas.push(v.llamada); verificacion = v.ok ? 'ok' : v.motivo }
      if (v?.ok) m = m.filter(x => !/^Confianza/.test(x))
      else m.push(`Verificador: ${v?.motivo ?? 'no respondió'}`)
    }
    return { m, verificacion, repetido }
  }
  const b = await borradorMensaje(db, a.conexionId, a.seller, a.pack, a.country, a.conInventario, a.hasta, undefined, op)
  if (a.textos) Object.assign(a, await a.textos())
  const e = await evaluar(b)
  if (e.m.length && e.m.every(x => CORREGIBLE_V2.test(x))) {
    const k = await borradorMensaje(db, a.conexionId, a.seller, a.pack, a.country, a.conInventario, a.hasta,
      { anterior: b.respuesta, problemas: e.m }, op).catch(() => null)
    if (k) {
      const e2 = await evaluar(k)
      if (!e2.m.length && k.respuesta) return { b: k, motivos: [], verificacion: e2.verificacion, corregida: true, original: b.respuesta, pedidoRepetido: e2.repetido, llamadas, acuse: null }
    }
  }
  const ac = acuseSeguro(e.m, textoPlano(a.comprador), a.tono)
  if (ac) return { b: { ...b, respuesta: ac.texto }, motivos: [], verificacion: e.verificacion, corregida: false, original: b.respuesta, pedidoRepetido: e.repetido, llamadas, acuse: ac.tipo, nota: ac.nota }
  return { b, motivos: e.m, verificacion: e.verificacion, corregida: false, original: null, pedidoRepetido: e.repetido, llamadas, acuse: null }
}
