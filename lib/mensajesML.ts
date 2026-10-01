// Mensajes post-venta de MercadoLibre: bandeja de conversaciones con mensajes sin leer.
//
// Verificado con la cuenta real: GET /messages/unread?role=seller&tag=post_sale devuelve
// [{ resource: '/packs/{pack}/sellers/{seller}', count }]. Leer una conversación con
// mark_as_read=false NO la marca como leída (así ML sigue avisando en su app); se marca
// al responder o con el botón "Marcar como leída".
import type { Pool } from 'pg'
import { mlFetch, ErrorML } from '@/lib/ml'

interface MensajeApi {
  from: { user_id: number }; to?: { user_id: number }; text: string
  message_date: { created: string; read: string | null }
  message_moderation?: { status: string }
  message_attachments?: unknown[]
}
interface Hilo { messages?: MensajeApi[]; conversation_status?: { status: string; substatus: string | null } }

export interface Mensaje {
  propio: boolean; texto: string; fecha: string; leido: string | null; moderacion: string | null; adjuntos: number
}

export async function leerHilo(db: Pool, conexionId: number, pack: string, sellerId: number, marcarLeido = false) {
  const h = await mlFetch<Hilo>(db, conexionId,
    `/messages/packs/${pack}/sellers/${sellerId}?tag=post_sale&mark_as_read=${marcarLeido}&limit=50`)
  const msgs = (h.messages ?? [])
  const mensajes: Mensaje[] = msgs.map(m => ({
    propio: m.from.user_id === sellerId, texto: m.text, fecha: m.message_date.created, leido: m.message_date.read,
    moderacion: m.message_moderation?.status ?? null, adjuntos: m.message_attachments?.length ?? 0,
  })).sort((a, b) => a.fecha.localeCompare(b.fecha))
  // El comprador: quien escribió y no es el vendedor, o a quien le escribió el vendedor.
  const comprador = msgs.find(m => m.from.user_id !== sellerId)?.from.user_id
    ?? msgs.find(m => m.from.user_id === sellerId)?.to?.user_id ?? null
  return { mensajes, comprador, estado: h.conversation_status?.status ?? null }
}

async function sellerDe(db: Pool, conexionId: number): Promise<number> {
  const { rows: [c] } = await db.query(`SELECT ml_user_id FROM ml_conexiones WHERE id = $1`, [conexionId])
  return Number(c.ml_user_id)
}

/** Títulos de la venta (pack o venta suelta), para mostrar en la bandeja. */
async function productosDe(db: Pool, conexionId: number, pack: string) {
  try {
    const o = await mlFetch<{ order_items: { item: { title: string }; quantity: number }[] }>(db, conexionId, `/orders/${pack}`)
    return o.order_items.map(i => `${i.quantity} × ${i.item.title}`).join(' · ')
  } catch (e) {
    if (!(e instanceof ErrorML)) throw e
    try {
      const p = await mlFetch<{ orders: { id: number }[] }>(db, conexionId, `/packs/${pack}`)
      const titulos: string[] = []
      for (const o of p.orders.slice(0, 5)) {
        const d = await mlFetch<{ order_items: { item: { title: string }; quantity: number }[] }>(db, conexionId, `/orders/${o.id}`)
        titulos.push(...d.order_items.map(i => `${i.quantity} × ${i.item.title}`))
      }
      return titulos.join(' · ') || null
    } catch { return null }
  }
}

/** Sincroniza los sin leer de una cuenta. Las que ya no están sin leer pasan a 0. */
export async function sincronizarMensajes(db: Pool, conexionId: number) {
  const seller = await sellerDe(db, conexionId)
  const r = await mlFetch<{ results?: { resource: string; count: number }[] }>(db, conexionId,
    `/messages/unread?role=seller&tag=post_sale`)
  const vistos: string[] = []
  for (const x of r.results ?? []) {
    const m = /\/packs\/(\d+)\//.exec(x.resource)
    if (!m) continue
    const pack = m[1]
    vistos.push(pack)
    const { rows: [prev] } = await db.query(
      `SELECT sin_leer, productos FROM ml_conversaciones WHERE pack_id = $1`, [pack])
    // Solo se relee el hilo si cambió la cantidad (ahorra llamadas a ML).
    if (prev && prev.sin_leer === x.count && prev.productos !== null) continue
    const hilo = await leerHilo(db, conexionId, pack, seller, false)
    const ultimo = hilo.mensajes[hilo.mensajes.length - 1]
    const productos = prev?.productos ?? await productosDe(db, conexionId, pack)
    await db.query(
      `INSERT INTO ml_conversaciones (pack_id, conexion_id, sin_leer, ultimo_texto, ultimo_de_comprador, ultimo_at,
                                      comprador_id, productos, actualizada_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
       ON CONFLICT (empresa_id, pack_id) DO UPDATE SET
         sin_leer = EXCLUDED.sin_leer, ultimo_texto = EXCLUDED.ultimo_texto,
         ultimo_de_comprador = EXCLUDED.ultimo_de_comprador, ultimo_at = EXCLUDED.ultimo_at,
         comprador_id = COALESCE(EXCLUDED.comprador_id, ml_conversaciones.comprador_id),
         productos = COALESCE(ml_conversaciones.productos, EXCLUDED.productos), actualizada_at = NOW()`,
      [pack, conexionId, x.count, ultimo?.texto ?? null, ultimo ? !ultimo.propio : null, ultimo?.fecha ?? null,
       hilo.comprador, productos])
  }
  await db.query(
    `UPDATE ml_conversaciones SET sin_leer = 0, actualizada_at = NOW()
     WHERE conexion_id = $1 AND sin_leer > 0 AND NOT (pack_id::text = ANY($2::text[]))`, [conexionId, vistos])
  return vistos.length
}

/** Responde en la conversación y la deja al día en la bandeja. Con `dejarSinLeer` no se
 *  marca como leída en ML (ML no permite volver a "no leída", así que se evita marcarla);
 *  después se consulta a ML si de verdad quedó sin leer. */
export async function responderHilo(db: Pool, conexionId: number, pack: string, texto: string, dejarSinLeer = false) {
  const seller = await sellerDe(db, conexionId)
  const antes = await leerHilo(db, conexionId, pack, seller, !dejarSinLeer)
  if (!antes.comprador) throw new Error('No se pudo identificar al comprador de esta conversación')
  await mlFetch(db, conexionId, `/messages/packs/${pack}/sellers/${seller}?tag=post_sale`, {
    method: 'POST', body: { from: { user_id: seller }, to: { user_id: antes.comprador }, text: texto },
  })
  const despues = await leerHilo(db, conexionId, pack, seller, !dejarSinLeer)
  const ultimo = despues.mensajes[despues.mensajes.length - 1]
  const sinLeer = dejarSinLeer ? await sinLeerEnML(db, conexionId, pack, seller) : 0
  await db.query(
    `UPDATE ml_conversaciones SET sin_leer = $4, ultimo_texto = $2, ultimo_de_comprador = FALSE, ultimo_at = $3,
            actualizada_at = NOW() WHERE pack_id = $1`, [pack, ultimo?.texto ?? texto, ultimo?.fecha ?? new Date().toISOString(), sinLeer])
  return { ...despues, sinLeer }
}

/** Cuántos mensajes del comprador siguen sin leer en ML en esta conversación. */
export async function sinLeerEnML(db: Pool, conexionId: number, pack: string, sellerId?: number) {
  const seller = sellerId ?? await sellerDe(db, conexionId)
  try {
    const r = await mlFetch<{ results?: { count: number }[] }>(db, conexionId,
      `/messages/unread/packs/${pack}/sellers/${seller}?tag=post_sale`)
    return r.results?.reduce((a, x) => a + x.count, 0) ?? 0
  } catch { return 0 }
}

export interface NotaML { id: string; texto: string; fecha: string; origen: string | null }

/** Notas de la venta en ML (las de "Notas" en el detalle de la venta). Prueba primero las del
 *  pack y después las de la orden: en MLV todavía no se sabe cuál usa la pantalla de ML. */
export async function notasDeVenta(db: Pool, conexionId: number, pack: string) {
  const intentos: { fuente: string; error: string | null }[] = []
  const notas: NotaML[] = []
  type Nota = { id: string; note: string; date_created: string; date_last_updated?: string; source_bu?: string | null }
  try {
    const r = await mlFetch<{ results?: Nota[] }[] | { results?: Nota[] }>(db, conexionId, `/packs/${pack}/notes`, { headers: { 'X-Public': 'true' } })
    for (const g of Array.isArray(r) ? r : [r]) for (const n of g.results ?? [])
      notas.push({ id: n.id, texto: n.note, fecha: n.date_last_updated ?? n.date_created, origen: n.source_bu ?? null })
    intentos.push({ fuente: 'pack', error: null })
  } catch (e) { intentos.push({ fuente: 'pack', error: e instanceof Error ? e.message : String(e) }) }
  try {
    const r = await mlFetch<{ results?: Nota[] }[] | { results?: Nota[] } | Nota[]>(db, conexionId, `/orders/${pack}/notes`)
    const lista: Nota[] = Array.isArray(r) ? r.flatMap(g => ('results' in g ? (g.results ?? []) : [g as Nota])) : (r.results ?? [])
    for (const n of lista) if (!notas.some(x => x.id === n.id))
      notas.push({ id: n.id, texto: n.note, fecha: n.date_last_updated ?? n.date_created, origen: n.source_bu ?? null })
    intentos.push({ fuente: 'orden', error: null })
  } catch (e) { intentos.push({ fuente: 'orden', error: e instanceof Error ? e.message : String(e) }) }
  return { notas, intentos }
}
