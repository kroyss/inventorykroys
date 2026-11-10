// Mensajes con IA en MODO PRUEBA (06-11-2026, migración 145, pedido del dueño). Solo empresas con el módulo `mensajes_ia`.
// Cuando llega un mensaje nuevo de un comprador (la conversación queda con el último mensaje del comprador), la IA escribe
// la respuesta con borradorMensaje (lib/mensajesIA.ts, la misma del botón) y decide si habría salido SOLA o a REVISIÓN.
// NO manda nada: queda como borrador en la conversación (lo encuentra escrito quien la abre) y en Mensajes → IA en prueba
// para marcar Bien / Mal. Una por mensaje del comprador (varios seguidos = uno: se espera ESPERA_MIN sin mensajes nuevos).
// La propietaria (SolucionesMC) lo corre siempre como prueba interna y no descuenta créditos ('simulacion').
// CLIENTES (09-11, mig. 158): solo con el automático ENCENDIDO (Mi IA) y cada respuesta usa 1 crédito ('mensajes');
// sin créditos no procesa. Los que no salen solos quedan escritos en la conversación para el equipo.
import type { Pool } from 'pg'
import { borradorMensaje } from '@/lib/mensajesIA'
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
const RECLAMO = /reclam|devol|reembols|cancel|anul|garant[ií]a|defect|da[ñn]ad|rot[oa]\b|no (me )?(lleg|funciona|sirve|enciende|carga|prende)|no (es|era) (lo que|el que|la que)|equivocad|incomplet|mal estado|estafa|denunci|queja|molest/i
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
const PREFIJOS = { pedido: 'PEDIDO ESPECIAL', reclamo: 'RECLAMO' } as const

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
  for (const r of rows) {
    try {
      // borradorMensaje relee la conversación en ML (y la guarda): después se toma lo que escribió el comprador desde el
      // último mensaje del vendedor (los seguidos, juntos).
      const b = await borradorMensaje(db, r.conexion_id, Number(r.seller), r.pack_id, country, conInventario)
      const { rows: msgs } = await db.query(
        `SELECT propio, texto FROM ml_mensajes WHERE pack_id = $1 ORDER BY fecha DESC LIMIT 10`, [r.pack_id])
      const corte = msgs.findIndex(m => m.propio)
      const comprador = (corte < 0 ? msgs : msgs.slice(0, corte)).reverse().map(m => String(m.texto)).join('\n').slice(0, 1000)
      const vendedor = msgs.filter(m => m.propio).map(m => String(m.texto)).join('\n')
      const motivos = motivosMensaje(b, comprador, persona, vendedor)
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
