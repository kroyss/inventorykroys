// Ventas de MercadoLibre: calificar al comprador y escribirle por la mensajería post-venta.
//
// Verificado contra la cuenta real (lectura): en MLV todas las órdenes quedan `confirmed` +
// `not_paid` (el pago va por fuera) y AUN ASÍ el vendedor las califica desde el panel; la
// calificación se lee en /orders/{id}/feedback (sale: fulfilled, rating, reason, message).
// El envío por API se valida con la primera prueba real (desde la pantalla, lo hace el dueño).
import type { Pool } from 'pg'
import { mlFetch, ErrorML } from '@/lib/ml'

export interface OrdenML {
  id: number; pack_id: number | null; status: string; date_created: string; tags: string[]
  seller: { id: number }; buyer: { id: number; nickname?: string; first_name?: string; last_name?: string }
  order_items: { item: { id: string; title: string }; quantity: number }[]
  total_amount: number; currency_id: string
  feedback: { seller: unknown; buyer: unknown }
}

/** Para el formulario de Ventas: con el número de la venta (orden o pack/carrito), la cuenta, el
 *  comprador y lo que compró. Se prueba en las cuentas conectadas: la que responde es la dueña. */
export async function ventaParaFormulario(db: Pool, numero: string) {
  const { rows: cuentas } = await db.query(`SELECT id, nickname FROM ml_conexiones WHERE estado = 'activa' ORDER BY id`)
  const noEsDeEsta = (e: unknown) => e instanceof ErrorML && [400, 401, 403, 404].includes(e.status)
  for (const c of cuentas) {
    let ordenes: OrdenML[] = []
    try {
      ordenes = [await mlFetch<OrdenML>(db, c.id, `/orders/${numero}`)]
    } catch (e) {
      if (!noEsDeEsta(e)) throw e
      try {
        const p = await mlFetch<{ orders: { id: number }[] }>(db, c.id, `/packs/${numero}`)
        ordenes = await Promise.all(p.orders.slice(0, 10).map(o => mlFetch<OrdenML>(db, c.id, `/orders/${o.id}`)))
      } catch (e2) {
        if (!noEsDeEsta(e2)) throw e2
      }
    }
    if (!ordenes.length) continue
    const b = ordenes.find(o => o.buyer)?.buyer
    return {
      cuenta: c.nickname as string,
      comprador: {
        nombre: [b?.first_name, b?.last_name].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim() || null,
        nick: b?.nickname ?? null,
      },
      items: ordenes.flatMap(o => o.order_items).map(i => ({ itemId: i.item.id, titulo: i.item.title, cantidad: i.quantity })),
    }
  }
  return null
}

/** Busca la orden en las cuentas conectadas de la empresa (la que responda es la dueña). */
export async function buscarOrden(db: Pool, orderId: string) {
  const { rows: cuentas } = await db.query(`SELECT id, nickname FROM ml_conexiones WHERE estado = 'activa' ORDER BY id`)
  for (const c of cuentas) {
    try {
      const o = await mlFetch<OrdenML>(db, c.id, `/orders/${orderId}`)
      return { conexionId: c.id as number, cuenta: c.nickname as string, orden: o }
    } catch (e) {
      if (e instanceof ErrorML && [401, 403, 404].includes(e.status)) continue
      throw e
    }
  }
  return null
}

export async function feedbackDeOrden(db: Pool, conexionId: number, orderId: string) {
  try {
    return await mlFetch<{ sale: Record<string, unknown> | null; purchase: Record<string, unknown> | null }>(
      db, conexionId, `/orders/${orderId}/feedback`)
  } catch (e) {
    if (e instanceof ErrorML && e.status === 404) return { sale: null, purchase: null }
    throw e
  }
}

export interface MensajeML { propio: boolean; texto: string; fecha: string; moderacion: string | null }

export async function mensajesDeOrden(db: Pool, conexionId: number, o: OrdenML): Promise<MensajeML[]> {
  const pack = o.pack_id ?? o.id
  const r = await mlFetch<{ messages?: { from: { user_id: number }; text: string; message_date: { created: string }; message_moderation?: { status: string } }[] }>(
    db, conexionId, `/messages/packs/${pack}/sellers/${o.seller.id}?tag=post_sale&mark_as_read=false&limit=20`)
  return (r.messages ?? []).map(m => ({
    propio: m.from.user_id === o.seller.id, texto: m.text, fecha: m.message_date.created,
    moderacion: m.message_moderation?.status ?? null,
  })).sort((a, b) => a.fecha.localeCompare(b.fecha))
}

// Motivos cuando la venta NO se concretó (los que usa el panel de ML para el vendedor).
export const MOTIVOS_NO_CONCRETADA: Record<string, string> = {
  BUYER_NOT_ENOUGH_MONEY: 'El comprador no pagó / no tenía el dinero',
  BUYER_REGRETS: 'El comprador se arrepintió',
  THEY_DIDNT_ANSWER: 'El comprador no respondió',
  OUT_OF_STOCK: 'No tenía el producto (sin stock)',
  THEY_NOT_HONORING_POLICIES: 'El comprador no respetó las condiciones',
}
