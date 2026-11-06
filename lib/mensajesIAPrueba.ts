// Mensajes con IA en MODO PRUEBA (06-11-2026, migración 145, pedido del dueño). Solo empresas con el módulo `mensajes_ia`.
// Cuando llega un mensaje nuevo de un comprador (la conversación queda con el último mensaje del comprador), la IA escribe
// la respuesta con borradorMensaje (lib/mensajesIA.ts, la misma del botón) y decide si habría salido SOLA o a REVISIÓN.
// NO manda nada: queda como borrador en la conversación (lo encuentra escrito quien la abre) y en Mensajes → IA en prueba
// para marcar Bien / Mal. Una por mensaje del comprador (varios seguidos = uno: se espera ESPERA_MIN sin mensajes nuevos).
// Mientras sea prueba interna no descuenta créditos del cliente (módulo 'simulacion').
import type { Pool } from 'pg'
import { borradorMensaje } from '@/lib/mensajesIA'
import { costoDe, registrarUso, iaConfigurada } from '@/lib/ia'
import { problemasDelTexto } from '@/lib/preguntasTexto'
import { leerMiIA, MI_IA_KEY } from '@/lib/miIA'

export const CLAVE_DESDE = 'mensajes_ia_desde'
const ESPERA_MIN = 2          // el comprador suele mandar 2 o 3 mensajes seguidos: se contesta al último
const HORAS_MAX = 24          // uno más viejo ya lo está viendo una persona
const POR_PASADA = 3

// Siempre los ve una persona (lo que escribió el COMPRADOR).
const RECLAMO = /reclam|devol|reembols|cancel|anul|garant[ií]a|defect|da[ñn]ad|rot[oa]\b|no (me )?(lleg|funciona|sirve|enciende|carga|prende)|no (es|era) (lo que|el que|la que)|equivocad|incomplet|mal estado|estafa|denunci|queja|molest/i
const PAGO = /comprobante|capture|captura|referencia|ya (pagu|transfer|hice el pago|deposit)|pagu[eé]|transfer[ií]|pago m[oó]vil|zelle|binance|no (me )?(aparece|refleja)|cobr(o|aron) (de m[aá]s|doble)/i
const DATOS = /\b\d{7,}\b|\bc\.?\s?i\.?\b|c[eé]dula|direcci[oó]n|\bcalle\b|\bav(enida|\.)|\burb(anizaci[oó]n|\.)|\bsector\b|\bedificio\b|\bapto\b|tel[eé]fono/i
// Lo que dice la IA.
const MONTO = /\d[\d.,]*\s?(bs\b|bs\.|bol[ií]vares)|\bbs\.?\s?\d|aproximad/i
const NEGATIVA = /\bno (lo |la |los |las )?(tenemos|tengo|hay|queda|quedan)\b|agotad|sin (stock|existencia)/i

/** Por qué NO saldría sola (vacío = saldría sola). */
export function motivosMensaje(b: { respuesta: string; confianza: string; falta_dato: string | null }, comprador: string, persona: string[] = []): string[] {
  const m: string[] = []
  if (RECLAMO.test(comprador)) m.push('Reclamo, cancelación o devolución: lo ve una persona')
  if (PAGO.test(comprador)) m.push('Habla de un pago o comprobante: lo verifica una persona')
  if (DATOS.test(comprador)) m.push('Manda datos personales o de envío: lo ve una persona')
  const tema = persona.find(t => t.length >= 4 && comprador.toLowerCase().includes(t.toLowerCase().split(' ')[0]))
  if (tema) m.push(`Tema que en Mi IA marcaste para una persona (${tema})`)
  if (!b.respuesta) { if (b.confianza !== 'alta') m.push('La IA no propuso respuesta'); return m }
  if (b.confianza !== 'alta') m.push(`Confianza ${b.confianza}${b.falta_dato ? `: ${b.falta_dato}` : ''}`)
  if (MONTO.test(b.respuesta)) m.push('Da un monto en bolívares o un estimado')
  if (NEGATIVA.test(b.respuesta)) m.push('Dice que no hay: lo confirma una persona')
  const p = problemasDelTexto(b.respuesta, 'mensaje')
  if (p.length) m.push(`MercadoLibre la borraría: ${p.join(', ')}`)
  return m
}

/** Lo llama el cron cada minuto. */
export async function procesarMensajesIA(db: Pool, country: string, conInventario: boolean) {
  if (!iaConfigurada()) return null
  const { rows: [d] } = await db.query(`SELECT value FROM app_settings WHERE key = $1`, [CLAVE_DESDE])
  const desde = d?.value ?? new Date().toISOString()
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
     RETURNING id, pack_id::text, conexion_id, (SELECT ml_user_id FROM ml_conexiones WHERE id = conexion_id) AS seller`,
    [desde, HORAS_MAX, ESPERA_MIN, POR_PASADA])
  if (!rows.length) return null
  const { rows: [mi] } = await db.query(`SELECT value FROM app_settings WHERE key = $1`, [MI_IA_KEY])
  const persona = leerMiIA(mi?.value)?.persona ?? []
  let listos = 0, errores = 0
  for (const r of rows) {
    try {
      // borradorMensaje relee la conversación en ML (y la guarda): después se toma lo que escribió el comprador desde el
      // último mensaje del vendedor (los seguidos, juntos).
      const b = await borradorMensaje(db, r.conexion_id, Number(r.seller), r.pack_id, country, conInventario)
      const { rows: msgs } = await db.query(
        `SELECT propio, texto FROM ml_mensajes WHERE pack_id = $1 ORDER BY fecha DESC LIMIT 10`, [r.pack_id])
      const corte = msgs.findIndex(m => m.propio)
      const comprador = (corte < 0 ? msgs : msgs.slice(0, corte)).reverse().map(m => String(m.texto)).join('\n').slice(0, 1000)
      const motivos = motivosMensaje(b, comprador, persona)
      const decision = !b.respuesta && b.confianza === 'alta' && !motivos.length ? 'nada' : motivos.length ? 'revisar' : 'sola'
      await registrarUso(db, 'simulacion', [{ modelo: b.modelo, uso: b.uso }], null)
      await db.query(
        `UPDATE ml_mensajes_ia SET estado = 'listo', comprador = $2, respuesta = $3, confianza = $4, falta_dato = $5,
           decision = $6, motivos = $7, modelo = $8, costo = $9 WHERE id = $1`,
        [r.id, comprador, b.respuesta || null, b.confianza, b.falta_dato, decision, motivos, b.modelo, costoDe(b.modelo, b.uso)])
      listos++
    } catch (e) {
      errores++
      const msg = (e instanceof Error ? e.message : String(e)).slice(0, 200)
      console.error('[mensajes ia]', r.pack_id, msg)
      await db.query(`UPDATE ml_mensajes_ia SET estado = 'error', error = $2 WHERE id = $1`, [r.id, msg]).catch(() => {})
    }
  }
  return { listos, errores }
}

/** El borrador de la IA para el último mensaje del comprador de una conversación (si lo hay y nadie contestó). */
export async function borradorPrueba(db: Pool, pack: string) {
  const { rows: [b] } = await db.query(
    `SELECT i.respuesta, i.confianza, i.falta_dato, i.decision, i.motivos FROM ml_mensajes_ia i
     JOIN ml_conversaciones c ON c.pack_id = i.pack_id
     WHERE i.pack_id = $1 AND i.estado = 'listo' AND c.ultimo_de_comprador AND i.mensaje_at >= c.ultimo_at
     ORDER BY i.mensaje_at DESC LIMIT 1`, [pack])
  return b ?? null
}

/** Para Mensajes → IA en prueba: los casos con lo que respondió el equipo después, y el resumen. */
export async function listaPrueba(db: Pool) {
  const { rows } = await db.query(
    `SELECT i.id::text, i.pack_id::text, i.mensaje_at, i.comprador, i.estado, i.respuesta, i.confianza, i.decision, i.motivos,
            i.error, i.marca, c.comprador_nombre, c.comprador_nick, c.productos, x.nickname AS cuenta,
            (SELECT string_agg(m.texto, E'\\n' ORDER BY m.fecha) FROM (
               SELECT texto, fecha FROM ml_mensajes m WHERE m.pack_id = i.pack_id AND m.propio AND m.fecha > i.mensaje_at
               ORDER BY fecha LIMIT 2) m) AS equipo
     FROM ml_mensajes_ia i
     LEFT JOIN ml_conversaciones c ON c.pack_id = i.pack_id
     LEFT JOIN ml_conexiones x ON x.id = i.conexion_id
     ORDER BY i.mensaje_at DESC LIMIT 300`)
  // Publicaciones que se contradicen (fotos / ficha / descripción, mig 146): para corregirlas en ML.
  const { rows: contradicciones } = await db.query(
    `SELECT f.item_id, COALESCE(c.titulo, f.item_id) AS titulo, c.permalink, f.contradicciones, f.leido_at
     FROM ml_item_fotos_ia f LEFT JOIN ml_catalogo c ON c.item_id = f.item_id
     WHERE f.contradicciones IS NOT NULL ORDER BY f.leido_at DESC LIMIT 50`).catch(() => ({ rows: [] }))
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
