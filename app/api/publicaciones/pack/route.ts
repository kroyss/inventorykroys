import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { sesionPublicaciones } from '@/lib/preguntasSesion'
import { apiError } from '@/lib/apiError'
import { ErrorML, mlFetch } from '@/lib/ml'
import { conexionDeItem } from '@/lib/stockML'
import { leerTablasEnvio } from '@/lib/mlShippingDb'
import { precioPack } from '@/lib/mlShipping'
import { refrescarItems } from '@/lib/catalogoML'

// 18-11 (el dueño: un cliente quería 10 bolsas y comprando varias se perdía el envío gratis): «Crear pack».
// Copia la publicación como «… Pack xN» (mismas fotos, categoría, atributos y descripción), con un precio que llega al
// mínimo de envío gratis de N × peso. Queda PAUSADA para que la persona la revise y la active, y queda vinculada al
// mismo producto como «trae N u.» (cada venta descuenta N del inventario; Stock vs inventario le reparte el stock).
// Una sola publicación por pedido: va directo (no por la cola).

const Pedido = z.object({
  item: z.string().regex(/^MLV\d{6,15}$/),
  variante_id: z.string().regex(/^\d{1,15}$/).nullable().optional(),
  unidades: z.number().int().min(2).max(100),
  precio: z.number().positive().max(1e7),
  titulo: z.string().trim().min(5).max(60),
  stock: z.number().int().min(1).max(9999),
})

interface ItemML {
  id: string; title: string; category_id: string; price: number; currency_id: string; buying_mode: string
  listing_type_id: string; condition: string; status: string
  pictures?: { id: string }[]
  attributes?: { id: string; value_id?: string | null; value_name?: string | null }[]
  sale_terms?: { id: string; value_id?: string | null; value_name?: string | null }[]
  shipping?: { mode?: string; local_pick_up?: boolean; free_shipping?: boolean }
  variations?: { id: number; picture_ids?: string[]; attribute_combinations?: { id: string; value_id?: string | null; value_name?: string | null }[] }[]
}

const conValor = <T extends { id: string; value_id?: string | null; value_name?: string | null }>(xs: T[] | undefined) =>
  (xs ?? []).filter(a => a.value_id || a.value_name).map(a => ({ id: a.id, ...(a.value_id ? { value_id: a.value_id } : { value_name: a.value_name }) }))

export async function POST(req: NextRequest) {
  const s = await sesionPublicaciones()
  if ('error' in s) return s.error
  if (s.session.user.country !== 'VE') return NextResponse.json({ error: 'Los packs por envío gratis son de Venezuela' }, { status: 400 })
  const parsed = Pedido.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 })
  const b = parsed.data
  try {
    const conexionId = await conexionDeItem(s.db, b.item)
    if (!conexionId) return NextResponse.json({ error: 'Esa publicación no es de tus cuentas conectadas' }, { status: 404 })

    // El producto de esa publicación (o variante): uno solo, vinculado de a 1 unidad.
    const num = b.item.replace(/^MLV/, '')
    const codigo = b.variante_id ? `${num}:${b.variante_id}` : num
    const { rows: prods } = await s.db.query<{ product_id: number; peso: number | null; code: string }>(
      `SELECT DISTINCT p.id AS product_id, p.weight_kg::float AS peso, p.code
         FROM product_ml_codes m JOIN products p ON p.id = m.product_id
        WHERE m.is_active AND p.is_active AND COALESCE(m.unidades, 1) = 1 AND m.ml_code = $1`, [codigo])
    if (prods.length !== 1) return NextResponse.json({
      error: prods.length ? 'Esa publicación está vinculada a varios productos: crea el pack a mano en MercadoLibre'
        : 'Primero vincula esta publicación con su producto (Mis publicaciones → Vincular)' }, { status: 422 })
    const prod = prods[0]
    if (prod.peso == null || !(prod.peso > 0)) return NextResponse.json({ error: `Falta el peso de ${prod.code}` }, { status: 422 })

    // El precio tiene que llegar al envío gratis del pack (si no, el pack no sirve para lo que se crea).
    const tablas = await leerTablasEnvio(s.db)
    const pk = precioPack(prod.peso, 1, b.unidades, tablas)
    if (pk.minimo != null && b.precio < pk.minimo) return NextResponse.json({
      error: `Un pack de ${b.unidades} pesa ${pk.kg.toLocaleString('de-DE')} kg: para tener envío gratis tiene que costar al menos $${pk.minimo}` }, { status: 422 })

    const it = await mlFetch<ItemML>(s.db, conexionId, `/items/${b.item}`)
    let fotos = (it.pictures ?? []).map(p => p.id)
    let atributos = conValor(it.attributes)
    if (it.variations?.length) {
      const v = b.variante_id ? it.variations.find(x => String(x.id) === b.variante_id) : null
      if (!v) return NextResponse.json({ error: 'La publicación tiene variantes: crea el pack desde la variante vinculada' }, { status: 422 })
      if (v.picture_ids?.length) fotos = v.picture_ids
      // Lo que distingue a la variante (color, modelo…) pasa a ser atributo del pack.
      const comb = conValor(v.attribute_combinations)
      atributos = [...atributos.filter(a => !comb.some(c => c.id === a.id)), ...comb]
    }

    const nuevo = await mlFetch<{ id: string; permalink?: string }>(s.db, conexionId, '/items', {
      method: 'POST',
      body: {
        title: b.titulo, category_id: it.category_id, price: b.precio, currency_id: it.currency_id,
        available_quantity: b.stock, buying_mode: it.buying_mode, listing_type_id: it.listing_type_id, condition: it.condition,
        pictures: fotos.slice(0, 12).map(id => ({ id })),
        attributes: atributos,
        ...(it.sale_terms?.length ? { sale_terms: conValor(it.sale_terms) } : {}),
        ...(it.shipping?.mode ? { shipping: { mode: it.shipping.mode, local_pick_up: !!it.shipping.local_pick_up, free_shipping: !!it.shipping.free_shipping } } : {}),
      },
    })

    // Pausada para revisarla (best-effort: si falla, la persona la pausa desde Mis publicaciones).
    let pausada = true
    await mlFetch(s.db, conexionId, `/items/${nuevo.id}`, { method: 'PUT', body: { status: 'paused' } }).catch(() => { pausada = false })

    // Descripción: la misma, con una línea al principio.
    let conDescripcion = true
    try {
      const d = await mlFetch<{ plain_text?: string }>(s.db, conexionId, `/items/${b.item}/description`)
      await mlFetch(s.db, conexionId, `/items/${nuevo.id}/description`, {
        method: 'POST', body: { plain_text: `PACK DE ${b.unidades} UNIDADES.\n\n${d?.plain_text ?? ''}`.slice(0, 50000) } })
    } catch { conDescripcion = false }

    // Vínculo «trae N u.» al mismo producto (la cuenta = el nickname de la conexión, como en Vincular).
    const { rows: [cx] } = await s.db.query<{ nickname: string }>(`SELECT nickname FROM ml_conexiones WHERE id = $1`, [conexionId])
    await s.db.query(
      `INSERT INTO product_ml_codes (product_id, ml_account, ml_code, is_active, unidades, combo_revisado)
       VALUES ($1, $2, $3, TRUE, $4, TRUE)`,
      [prod.product_id, cx?.nickname ?? '', nuevo.id.replace(/^MLV/, ''), b.unidades])
    await refrescarItems(s.db, conexionId, [nuevo.id]).catch(() => {})

    return NextResponse.json({ ok: true, item_id: nuevo.id, permalink: nuevo.permalink ?? null, pausada, conDescripcion, kg: pk.kg })
  } catch (err) {
    if (err instanceof ErrorML) {
      // Al crear, ML explica en `cause` (p. ej. un atributo obligatorio): se muestra eso, que es lo que hay que corregir.
      const causas = ((err.datos as { cause?: { message?: string; type?: string }[] } | null)?.cause ?? [])
        .filter(c => c.type !== 'warning' && c.message).map(c => c.message).slice(0, 3)
      return NextResponse.json({ error: `MercadoLibre no la aceptó: ${causas.length ? causas.join(' · ') : err.message}` }, { status: 502 })
    }
    return apiError(err)
  }
}
