// MercadoLibre SIMULADO para las cuentas de demostración (lib/demo.ts). mlFetch llega aquí en vez
// de salir a internet cuando la cuenta es de demo, así cada pantalla hace su flujo de siempre
// (publicar, releer lo publicado, notas, stock…) contra los datos sembrados en la base.
// Responde solo lo que usa el sistema; cualquier otra ruta da 404 (como una venta que no existe).
import type { Pool } from 'pg'
import { ErrorML } from '@/lib/ml'
import { compradorDemo, productoDemo } from '@/lib/demoDatos'

type Init = { method?: string; body?: unknown; headers?: Record<string, string> }

const noExiste = (ruta: string) => new ErrorML(404, { message: 'not_found' }, `MercadoLibre respondió 404: ${ruta} no existe`)

/** Las notas de la venta se guardan unidas en ml_ordenes.notas (como las deja la sincronización). */
const partirNotas = (t: string | null) => (t ?? '').split(' · ').map(x => x.trim()).filter(Boolean)

export async function mlDemo<T>(db: Pool, conexionId: number, ruta: string, init?: Init): Promise<T> {
  const metodo = (init?.method ?? 'GET').toUpperCase()
  const body = (init?.body ?? {}) as Record<string, unknown>
  const [camino, query = ''] = ruta.split('?')
  const qs = new URLSearchParams(query)
  const p = camino.split('/').filter(Boolean)
  let m: RegExpMatchArray | null
  const r = <X>(x: X) => x as unknown as T

  const { rows: [cx] } = await db.query(`SELECT ml_user_id::text, nickname FROM ml_conexiones WHERE id = $1`, [conexionId])
  const seller = Number(cx?.ml_user_id ?? 0)

  // ── Mensajes ────────────────────────────────────────────────────────────
  if ((m = camino.match(/^\/messages\/packs\/(\d+)\/sellers\/\d+$/))) {
    const pack = m[1]
    const { rows: [o] } = await db.query(`SELECT comprador FROM ml_ordenes WHERE id = $1::bigint`, [pack])
    const comprador = compradorDemo(o?.comprador ?? '')
    if (metodo === 'POST') {
      const texto = String(body.text ?? '').trim()
      await db.query(
        `INSERT INTO ml_mensajes (msg_id, pack_id, conexion_id, propio, texto, fecha) VALUES ($1, $2, $3, TRUE, $4, NOW())`,
        [`demo-${pack}-${Date.now()}`, pack, conexionId, texto])
      return r({ status: 'available' })
    }
    const { rows: [c] } = await db.query(`SELECT sin_leer FROM ml_conversaciones WHERE pack_id = $1::bigint`, [pack])
    const { rows } = await db.query(
      `SELECT msg_id, propio, texto, fecha FROM ml_mensajes WHERE pack_id = $1::bigint ORDER BY fecha`, [pack])
    const leidos = qs.get('mark_as_read') === 'true' || !(c?.sin_leer > 0)
    const offset = Number(qs.get('offset') ?? 0), limit = Number(qs.get('limit') ?? 50)
    return r({
      paging: { total: rows.length, offset, limit },
      conversation_status: { status: 'active', substatus: null },
      messages: rows.slice(offset, offset + limit).map(x => ({
        id: x.msg_id,
        from: { user_id: x.propio ? seller : comprador.id }, to: { user_id: x.propio ? comprador.id : seller },
        text: x.texto,
        message_date: { created: new Date(x.fecha).toISOString(), read: x.propio || leidos ? new Date(x.fecha).toISOString() : null },
        message_moderation: { status: 'clean' }, message_attachments: [],
      })),
    })
  }
  if (camino.startsWith('/messages/unread')) return r({ results: [] })

  // ── Órdenes (ventas) ────────────────────────────────────────────────────
  if (p[0] === 'orders' && /^\d+$/.test(p[1] ?? '')) {
    const { rows: [o] } = await db.query(
      `SELECT id::text, fecha, comprador, total::float, moneda, estado, detalle, items, notas, cal_vendedor, cal_concretada
       FROM ml_ordenes WHERE id = $1::bigint`, [p[1]])
    if (!o) throw noExiste(camino)
    // Notas de la venta
    if (p[2] === 'notes') {
      const notas = partirNotas(o.notas)
      const guardar = (n: string[]) => db.query(`UPDATE ml_ordenes SET notas = $2 WHERE id = $1::bigint`, [p[1], n.join(' · ') || null])
      if (metodo === 'POST') { await guardar([...notas, String(body.note ?? '').trim()]); return r({}) }
      if (metodo === 'PUT' && p[3]) { notas[Number(p[3])] = String(body.note ?? '').trim(); await guardar(notas); return r({}) }
      if (metodo === 'DELETE' && p[3]) { notas.splice(Number(p[3]), 1); await guardar(notas); return r({}) }
      const fecha = new Date(o.fecha).toISOString()
      return r([{ results: notas.map((note, i) => ({ id: String(i), note, date_created: fecha })) }])
    }
    if (p[2] === 'feedback') {
      if (metodo === 'POST') {
        await db.query(`UPDATE ml_ordenes SET cal_vendedor = $2, cal_concretada = $3 WHERE id = $1::bigint`,
          [p[1], String(body.rating ?? 'positive'), body.fulfilled !== false])
        return r({})
      }
      return r({ sale: o.cal_vendedor ? { rating: o.cal_vendedor, fulfilled: o.cal_concretada } : null, purchase: null })
    }
    if (p.length > 2) throw noExiste(camino)
    const b = compradorDemo(o.comprador ?? '')
    const detalle = (o.detalle ?? []) as { titulo: string; cantidad: number; variante: string | null }[]
    const items = (o.items ?? []) as string[]
    return r({
      id: Number(o.id), pack_id: null, status: o.estado ?? 'paid', date_created: new Date(o.fecha).toISOString(), tags: ['paid'],
      seller: { id: seller }, buyer: b,
      order_items: detalle.map((d, i) => {
        const [itemId, varId] = (items[i] ?? '').split(':')
        return { item: { id: itemId || 'MLV0', title: d.titulo, variation_id: varId ? Number(varId) : null,
                         variation_attributes: d.variante ? [{ name: d.variante.split(':')[0], value_name: d.variante.split(':').slice(1).join(':').trim() }] : [] },
                 quantity: d.cantidad }
      }),
      total_amount: o.total, currency_id: o.moneda ?? 'USD',
      feedback: { seller: o.cal_vendedor ? { rating: o.cal_vendedor } : null, buyer: null },
    })
  }
  if (p[0] === 'orders' && p[1] === 'search') return r({ results: [], paging: { total: 0 } })
  if (p[0] === 'packs') throw noExiste(camino)

  // ── Publicaciones ───────────────────────────────────────────────────────
  if (p[0] === 'items' && p[1]) {
    const item = p[1]
    const prod = productoDemo(item)
    if (!prod) throw noExiste(camino)
    if (p[2] === 'description') return r({ plain_text: prod.descripcion })
    if (metodo === 'PUT') {
      // Cambio de stock: de la publicación (variante 0) o de una variante.
      const variante = p[2] === 'variations' ? p[3] : '0'
      const cantidad = Number(body.available_quantity ?? 0)
      await db.query(
        `UPDATE ml_stock_alertas SET disponible = $3, estado = 'active', agotada_desde = NULL,
                bajo_desde = NULL, actualizado_at = GREATEST(actualizado_at, NOW())
         WHERE item_id = $1 AND variante_id = $2::bigint`, [item, variante, cantidad])
      await db.query(`UPDATE ml_preguntas SET item_estado = 'active' WHERE item_id = $1`, [item])
      return r({})
    }
    const { rows: alertas } = await db.query(
      `SELECT variante_id::text, disponible, estado FROM ml_stock_alertas WHERE item_id = $1`, [item])
    const { rows: [pq] } = await db.query(
      `SELECT item_estado FROM ml_preguntas WHERE item_id = $1 AND item_estado IS NOT NULL ORDER BY fecha DESC LIMIT 1`, [item])
    const dispVar = (v: string) => alertas.find(a => a.variante_id === v)?.disponible ?? 12
    const variaciones = Object.entries(prod.variantes ?? {}).map(([id, nombre]) => ({
      id: Number(id), available_quantity: dispVar(id),
      attribute_combinations: [{ name: nombre.split(':')[0], value_name: nombre.split(':').slice(1).join(':').trim() }],
    }))
    const disponible = variaciones.length ? variaciones.reduce((a, v) => a + v.available_quantity, 0) : dispVar('0')
    const pausada = pq?.item_estado === 'paused' || (disponible <= 0)
    return r({
      id: item, title: prod.titulo, price: prod.precio, currency_id: 'USD', available_quantity: Math.max(0, disponible),
      condition: 'new', status: pausada ? 'paused' : 'active', sub_status: pausada ? ['out_of_stock'] : [],
      permalink: null, category_id: null, warranty: 'Garantía del vendedor: 30 días',
      shipping: { free_shipping: false }, variations: variaciones,
      attributes: [{ name: 'Condición del ítem', value_name: 'Nuevo' }],
    })
  }

  // ── Preguntas ───────────────────────────────────────────────────────────
  if (camino === '/answers' && metodo === 'POST') {
    const id = String(body.question_id ?? '')
    const { rows: [q] } = await db.query(`SELECT item_estado FROM ml_preguntas WHERE id = $1::bigint`, [id])
    if (!q) throw noExiste(`/questions/${id}`)
    if (q.item_estado === 'paused') throw new ErrorML(400, { message: 'Item must be active' }, 'MercadoLibre respondió 400: Item must be active')
    await db.query(
      `UPDATE ml_preguntas SET estado = 'ANSWERED', respuesta = $2, respuesta_estado = 'ACTIVE', respuesta_fecha = NOW() WHERE id = $1::bigint`,
      [id, String(body.text ?? '').trim()])
    return r({})
  }
  if ((m = camino.match(/^\/questions\/(\d+)$/))) {
    if (metodo === 'DELETE') return r({})
    const { rows: [q] } = await db.query(
      `SELECT estado, respuesta, respuesta_estado, respuesta_fecha FROM ml_preguntas WHERE id = $1::bigint`, [m[1]])
    if (!q) throw noExiste(camino)
    return r({
      status: q.estado,
      answer: q.respuesta ? { text: q.respuesta, status: q.respuesta_estado ?? 'ACTIVE', date_created: new Date(q.respuesta_fecha ?? Date.now()).toISOString() } : null,
    })
  }
  if (camino.startsWith('/questions/search')) return r({ questions: [], total: 0 })

  throw noExiste(camino)
}
