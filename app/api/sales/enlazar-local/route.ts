import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { sesionPreguntas } from '@/lib/preguntasSesion'
import { tieneModulo } from '@/lib/modulos'

// Enlazar una venta de ML con la venta LOCAL que se registró a mano (mig 165, 11-11): cobro destino cargado como LOCAL-….
// GET  ?numero=<orden o pack> → ventas LOCAL de los últimos 20 días (las más parecidas primero) + a cuál está enlazada hoy
// POST { numero, saleId }     → enlaza todas las órdenes del número; saleId null = deshacer
const DIAS = 20

async function sesion() {
  const s = await sesionPreguntas()
  if ('error' in s) return s
  if (!tieneModulo(s.session.user, 'inventario')) return { error: NextResponse.json({ error: 'Solo con inventario' }, { status: 403 }) } as const
  return s
}

export async function GET(req: NextRequest) {
  const s = await sesion()
  if ('error' in s) return s.error
  const numero = req.nextUrl.searchParams.get('numero') ?? ''
  if (!/^\d{6,25}$/.test(numero)) return NextResponse.json({ error: 'Número inválido' }, { status: 400 })
  try {
    const { rows: [o] } = await s.db.query(
      `SELECT max(o.venta_local_id) AS enlazada, max(COALESCE(NULLIF(o.comprador_nombre, ''), o.comprador)) AS comprador,
              min(o.fecha) AS fecha, array_agg(DISTINCT i) FILTER (WHERE i IS NOT NULL) AS items
       FROM ml_ordenes o LEFT JOIN LATERAL unnest(o.items) i ON TRUE
       WHERE o.id::text = $1 OR o.pack_id::text = $1`, [numero])
    if (!o?.fecha) return NextResponse.json({ error: 'No se encontró la venta de MercadoLibre' }, { status: 404 })
    // Productos de la venta de ML (por sus publicaciones vinculadas), para poner primero las LOCAL con el mismo producto.
    const pubs = ((o.items as string[] | null) ?? []).map(i => i.replace(/^[A-Z]{3}/, ''))
    const { rows } = await s.db.query(
      `SELECT s.id, s.ml_order_number AS numero, s.customer_name AS cliente, s.total_amount::float AS total, s.created_at, s.status,
              (SELECT string_agg(p.name, ' · ' ORDER BY p.name) FROM sale_items si JOIN products p ON p.id = si.product_id WHERE si.sale_id = s.id) AS productos,
              EXISTS (SELECT 1 FROM sale_items si JOIN product_ml_codes m ON m.product_id = si.product_id AND m.is_active
                      WHERE si.sale_id = s.id AND split_part(m.ml_code, ':', 1) = ANY($2::text[])) AS mismo_producto,
              similarity(COALESCE(s.customer_name, ''), COALESCE($3, ''))::float AS parecido,
              (SELECT string_agg(DISTINCT COALESCE(x.pack_id, x.id)::text, ', ') FROM ml_ordenes x WHERE x.venta_local_id = s.id) AS enlazada_a
       FROM sales s
       WHERE s.ml_order_number LIKE 'LOCAL-%' AND s.created_at > $1::timestamptz - make_interval(days => ${DIAS})
         AND s.created_at < $1::timestamptz + make_interval(days => ${DIAS})
       ORDER BY mismo_producto DESC, parecido DESC, abs(EXTRACT(EPOCH FROM s.created_at - $1::timestamptz)) LIMIT 40`,
      [o.fecha, pubs, o.comprador ?? ''])
    return NextResponse.json({ enlazada: o.enlazada ?? null, comprador: o.comprador, ventas: rows })
  } catch (err) {
    return apiError(err)
  }
}

const Body = z.object({ numero: z.string().regex(/^\d{6,25}$/), saleId: z.number().int().positive().nullable() })

export async function POST(req: NextRequest) {
  const s = await sesion()
  if ('error' in s) return s.error
  try {
    const b = Body.parse(await req.json())
    if (b.saleId) {
      const { rows: [v] } = await s.db.query(`SELECT 1 FROM sales WHERE id = $1 AND ml_order_number LIKE 'LOCAL-%'`, [b.saleId])
      if (!v) return NextResponse.json({ error: 'Esa no es una venta LOCAL' }, { status: 400 })
    }
    const { rowCount } = await s.db.query(
      `UPDATE ml_ordenes SET venta_local_id = $2, venta_local_por = CASE WHEN $2::int IS NULL THEN NULL ELSE $3::int END,
              venta_local_at = CASE WHEN $2::int IS NULL THEN NULL ELSE NOW() END
       WHERE id::text = $1 OR pack_id::text = $1`, [b.numero, b.saleId, parseInt(s.session.user.id, 10)])
    return NextResponse.json({ ok: true, ordenes: rowCount ?? 0 })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message }, { status: 400 })
    return apiError(err)
  }
}
