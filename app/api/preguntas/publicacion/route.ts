import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { sesionPreguntas } from '@/lib/preguntasSesion'
import { mlFetch, ErrorML, CuentaDesconectada } from '@/lib/ml'

interface ItemML {
  id: string; title: string; price: number | null; original_price?: number | null; currency_id?: string
  available_quantity?: number; sold_quantity?: number; condition?: string; status?: string; permalink?: string | null
  thumbnail?: string; warranty?: string | null; shipping?: { free_shipping?: boolean }
  pictures?: { id: string; secure_url?: string; url?: string }[]
  variations?: { id: number; available_quantity?: number; price?: number; picture_ids?: string[]; attribute_combinations?: { name?: string; value_name?: string | null }[] }[]
  attributes?: { id?: string; name?: string; value_name?: string | null }[]
}

export interface Ficha {
  id: string; titulo: string; precio: number | null; precio_original: number | null; moneda: string
  disponible: number; vendidos: number | null; condicion: string | null; estado: string | null; link: string
  envio_gratis: boolean; garantia: string | null; fotos: string[]
  variantes: { id: string; nombre: string; stock: number; foto: number | null }[]
  atributos: { nombre: string; valor: string }[]
  descripcion: string; ejemplo?: boolean
}

// Atributos que no le dicen nada al vendedor que responde (ya están arriba o son internos).
const SIN_INTERES = new Set(['ITEM_CONDITION', 'SELLER_SKU', 'GTIN', 'PRODUCT_DATA_SOURCE', 'IS_FLAMMABLE', 'IS_KIT', 'EXCLUSIVE_CHANNEL', 'SHIPMENT_PACKING'])

const linkCorto = (id: string) => {
  const m = /^([A-Z]{3})(\d+)$/.exec(id)!
  return `https://articulo.mercadolibre.${m[1] === 'MCO' ? 'com.co' : 'com.ve'}/${m[1]}-${m[2]}-_JM`
}

// GET /api/preguntas/publicacion?item=MLV… → la publicación como la ve el comprador (fotos, precio,
// stock, variantes, características y descripción), leída de ML al abrir la ficha en Preguntas o
// Mensajes y Stock ("ver la publicación sin salir de lo que estoy haciendo").
export async function GET(req: NextRequest) {
  const s = await sesionPreguntas()
  if ('error' in s) return s.error
  const item = req.nextUrl.searchParams.get('item') ?? ''
  if (!/^[A-Z]{3}\d+$/.test(item)) return NextResponse.json({ error: 'Publicación inválida' }, { status: 400 })
  try {
    // La cuenta dueña de la publicación: catálogo, preguntas o ventas (lo que ya esté guardado).
    const { rows: [g] } = await s.db.query(
      `SELECT COALESCE(
         (SELECT conexion_id FROM ml_catalogo WHERE item_id = $1),
         (SELECT conexion_id FROM ml_preguntas WHERE item_id = $1 ORDER BY fecha DESC LIMIT 1),
         (SELECT conexion_id FROM ml_stock_alertas WHERE item_id = $1 LIMIT 1),
         (SELECT conexion_id FROM ml_ordenes WHERE items[1] LIKE $1 || '%' ORDER BY fecha DESC LIMIT 1)) AS conexion_id,
         (SELECT titulo FROM ml_catalogo WHERE item_id = $1) AS titulo_cat,
         (SELECT precio::float FROM ml_catalogo WHERE item_id = $1) AS precio_cat,
         (SELECT thumbnail FROM ml_catalogo WHERE item_id = $1) AS foto_cat,
         (SELECT item_titulo FROM ml_preguntas WHERE item_id = $1 AND item_titulo IS NOT NULL LIMIT 1) AS titulo_preg,
         (SELECT item_imagen FROM ml_preguntas WHERE item_id = $1 AND item_imagen IS NOT NULL LIMIT 1) AS foto_preg`, [item])
    if (!g?.conexion_id) return NextResponse.json({ error: 'Publicación no encontrada en tus cuentas' }, { status: 404 })
    try {
      const [it, desc, sp] = await Promise.all([
        mlFetch<ItemML>(s.db, g.conexion_id, `/items/${item}`),
        mlFetch<{ plain_text?: string }>(s.db, g.conexion_id, `/items/${item}/description`).catch(() => ({ plain_text: '' })),
        // Precio con la promoción vigente (lo que paga hoy el comprador); /items trae el de lista.
        mlFetch<{ amount?: number | null; regular_amount?: number | null; currency_id?: string | null }>(
          s.db, g.conexion_id, `/items/${item}/sale_price?context=channel_marketplace`).catch(() => null),
      ])
      if (sp?.amount) {
        const lista = sp.regular_amount ?? it.original_price ?? it.price
        it.price = sp.amount
        it.original_price = lista && lista > sp.amount ? lista : null
        if (sp.currency_id) it.currency_id = sp.currency_id
      }
      const fotos = (it.pictures ?? []).map(p => p.secure_url ?? p.url ?? '').filter(Boolean).slice(0, 60)   // todas (18-10: con 15, las variantes con fotos más atrás no se podían ver)
      const ids = (it.pictures ?? []).map(p => p.id)
      const ficha: Ficha = {
        id: it.id, titulo: it.title, precio: it.price ?? null, precio_original: it.original_price ?? null,
        moneda: it.currency_id ?? 'USD', disponible: it.available_quantity ?? 0, vendidos: it.sold_quantity ?? null,
        condicion: it.condition === 'new' ? 'Nuevo' : it.condition === 'used' ? 'Usado' : null,
        estado: it.status ?? null, link: it.permalink || linkCorto(item),
        envio_gratis: !!it.shipping?.free_shipping, garantia: it.warranty ?? null,
        fotos: fotos.length ? fotos : it.thumbnail ? [it.thumbnail] : [],
        variantes: (it.variations ?? []).map(v => {
          const i = v.picture_ids?.length ? ids.indexOf(v.picture_ids[0]) : -1
          return {
            id: String(v.id),
            nombre: (v.attribute_combinations ?? []).map(a => a.value_name).filter(Boolean).join(' · ') || `Variante ${v.id}`,
            stock: v.available_quantity ?? 0, foto: i >= 0 && i < fotos.length ? i : null,
          }
        }),
        atributos: (it.attributes ?? [])
          .filter(a => a.name && a.value_name && !SIN_INTERES.has(a.id ?? ''))
          .map(a => ({ nombre: a.name!, valor: a.value_name! })).slice(0, 24),
        descripcion: (desc.plain_text ?? '').trim(),
      }
      return NextResponse.json(ficha)
    } catch (err) {
      // Staging: sus copias de cuentas de ML no tienen acceso (tokens vencidos). Para revisar cómo se
      // ve la ficha se arma una de EJEMPLO con lo guardado + datos ficticios (nunca en producción).
      if (process.env.APP_ENV === 'staging') {   // cualquier error: tokens vencidos o cifrados con otra clave
        return NextResponse.json(fichaEjemplo(item, g.titulo_cat ?? g.titulo_preg ?? 'Publicación', g.precio_cat, g.foto_cat ?? g.foto_preg))
      }
      throw err
    }
  } catch (err) {
    if (err instanceof ErrorML) return NextResponse.json({ error: `MercadoLibre: ${err.message}` }, { status: 502 })
    if (err instanceof CuentaDesconectada) return NextResponse.json({ error: 'La cuenta de MercadoLibre está desconectada' }, { status: 409 })
    return apiError(err)
  }
}

function fichaEjemplo(item: string, titulo: string, precio: number | null, foto: string | null): Ficha {
  const color = (c: string, t: string) => 'data:image/svg+xml,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><rect width="400" height="400" fill="${c}"/><text x="200" y="215" font-family="sans-serif" font-size="28" fill="#fff" text-anchor="middle">${t}</text></svg>`)
  const p = precio ?? 12.5
  return {
    id: item, titulo, precio: p, precio_original: Math.round(p * 1.25 * 100) / 100, moneda: 'USD',
    disponible: 37, vendidos: 214, condicion: 'Nuevo', estado: 'active', link: linkCorto(item),
    envio_gratis: false, garantia: 'Garantía del vendedor: 30 días',
    fotos: [...(foto ? [foto] : []), color('#2563eb', 'Foto azul'), color('#111827', 'Foto negra'), color('#db2777', 'Foto rosada'), color('#65a30d', 'Detalle')],
    variantes: [
      { id: '1', nombre: 'Azul', stock: 15, foto: foto ? 1 : 0 },
      { id: '2', nombre: 'Negro', stock: 22, foto: foto ? 2 : 1 },
      { id: '3', nombre: 'Rosado', stock: 0, foto: foto ? 3 : 2 },
    ],
    atributos: [
      { nombre: 'Marca', valor: 'Genérica' }, { nombre: 'Modelo', valor: 'X-200' },
      { nombre: 'Material', valor: 'Plástico ABS' }, { nombre: 'Largo', valor: '20 cm' },
      { nombre: 'Ancho', valor: '12 cm' }, { nombre: 'Peso', valor: '250 g' },
      { nombre: 'Unidades por paquete', valor: '1' },
    ],
    descripcion: '(DATOS DE EJEMPLO: en staging no se puede leer MercadoLibre)\n\nPRODUCTO NUEVO, ORIGINAL Y CON GARANTÍA.\n\n'
      + '✅ Características:\n- Material resistente\n- Medidas: 20 x 12 cm\n- Disponible en azul y negro\n\n'
      + '📦 Envíos a todo el país por ZOOM o TEALCA (cobro a destino).\n🏪 Retiro personal en la tienda.\n\n'
      + 'Somos tienda oficial con más de 5 años en MercadoLibre. ¡Pregunta antes de ofertar!',
    ejemplo: true,
  }
}
