// "Lo que se habló" en Ventas → Nueva venta (2026-10-11): todo lo que hay que mirar en MercadoLibre
// para registrar bien la venta, sin salir del formulario: lo ofertado (foto, título, variante,
// cantidad, precio), las notas de la venta, los últimos mensajes y lo que preguntó antes de comprar.
// Se pide solo cuando se abre (un clic). Nada se marca como leído en ML.
import type { Pool } from 'pg'
import { mlFetch, ErrorML } from '@/lib/ml'
import { conexionDeVenta, leerNotas } from '@/lib/notasML'
import { leerHilo } from '@/lib/mensajesML'
import { preguntasDeComprador, type PreguntaPrevia } from '@/lib/preguntasComprador'

type Orden = {
  id: number; pack_id: number | null; total_amount?: number; currency_id?: string
  order_items: {
    item: { id: string; title: string; variation_attributes?: { name?: string; value_name?: string | null }[] }
    quantity: number; unit_price?: number
  }[]
  buyer?: { id: number; nickname?: string; first_name?: string; last_name?: string }
}

export interface ItemOfertado {
  id: string; titulo: string; variante: string | null; cantidad: number
  precio: number | null; moneda: string | null; imagen: string | null; link: string | null
}
export interface ContextoVenta {
  cuenta: string | null
  items: ItemOfertado[]
  total: number | null; moneda: string | null
  notas: string[]
  mensajes: { propio: boolean; texto: string; fecha: string; adjuntos: AdjuntoMensaje[] }[]
  preguntas: PreguntaPrevia[]
}
/** Adjunto de un mensaje: se ve por /api/mensajes/[pack]/adjunto (lo trae de ML, solo de ese hilo). */
export interface AdjuntoMensaje { url: string; nombre: string; imagen: boolean }

const MAX_MENSAJES = 8

export async function contextoDeVenta(db: Pool, numero: string): Promise<ContextoVenta | null> {
  const conexionId = await conexionDeVenta(db, numero)
  if (!conexionId) return null
  const { rows: [c] } = await db.query(`SELECT nickname, ml_user_id FROM ml_conexiones WHERE id = $1`, [conexionId])

  let ordenes: Orden[]
  try {
    ordenes = [await mlFetch<Orden>(db, conexionId, `/orders/${numero}`)]
  } catch (e) {
    if (!(e instanceof ErrorML)) throw e
    const p = await mlFetch<{ orders: { id: number }[] }>(db, conexionId, `/packs/${numero}`)
    ordenes = await Promise.all(p.orders.slice(0, 10).map(o => mlFetch<Orden>(db, conexionId, `/orders/${o.id}`)))
  }
  const pack = String(ordenes[0]?.pack_id ?? numero)
  const comprador = ordenes.find(o => o.buyer)?.buyer

  // Foto de cada publicación (la miniatura; si falla, sin foto). Una tras otra: la conexión a la
  // base es una sola por request y pg no quiere consultas en paralelo sobre la misma.
  const ids = [...new Set(ordenes.flatMap(o => o.order_items.map(i => i.item.id)))]
  const fotos = new Map<string, string | null>()
  for (const id of ids) {
    try {
      const it = await mlFetch<{ secure_thumbnail?: string; thumbnail?: string }>(db, conexionId, `/items/${id}?attributes=secure_thumbnail,thumbnail`)
      fotos.set(id, it.secure_thumbnail || it.thumbnail || null)
    } catch { fotos.set(id, null) }
  }

  const items: ItemOfertado[] = ordenes.flatMap(o => o.order_items.map(i => {
    const m = /^(M[A-Z]{2})(\d+)$/.exec(i.item.id)
    return {
      id: i.item.id, titulo: i.item.title,
      variante: (i.item.variation_attributes ?? []).filter(a => a.value_name).map(a => `${a.name}: ${a.value_name}`).join(' · ') || null,
      cantidad: i.quantity, precio: i.unit_price ?? null, moneda: o.currency_id ?? null,
      imagen: fotos.get(i.item.id) ?? null,
      link: m ? `https://articulo.mercadolibre.${m[1] === 'MCO' ? 'com.co' : 'com.ve'}/${m[1]}-${m[2]}-_JM` : null,
    }
  }))

  const notas = await leerNotas(db, conexionId, numero).then(r => r.notas.map(n => n.texto.trim()).filter(Boolean)).catch(() => [])
  const hilo = await leerHilo(db, conexionId, pack, Number(c.ml_user_id), false).catch(() => null)
  const preguntas = comprador?.id ? await preguntasDeComprador(db, comprador.id, null, 10).catch(() => []) : []
  const mensajes = (hilo?.mensajes ?? []).filter(m => m.texto?.trim() || m.adjuntos.length).slice(-MAX_MENSAJES)
    .map(m => ({ propio: m.propio, texto: m.texto ?? '', fecha: m.fecha,
      adjuntos: m.adjuntos.map(a => ({
        url: `/api/mensajes/${pack}/adjunto?f=${encodeURIComponent(a.archivo)}`, nombre: a.nombre,
        imagen: !!a.tipo?.startsWith('image/') || /\.(jpe?g|png|gif|webp)$/i.test(a.archivo),
      })) }))

  const total = ordenes.reduce((s, o) => s + (o.total_amount ?? 0), 0)
  return {
    cuenta: c.nickname ?? null, items,
    total: total || null, moneda: ordenes[0]?.currency_id ?? null,
    notas, mensajes, preguntas,
  }
}
