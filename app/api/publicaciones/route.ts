import { NextRequest, NextResponse } from 'next/server'
import { sesionPublicaciones } from '@/lib/preguntasSesion'
import { apiError } from '@/lib/apiError'
import { whereFiltro } from '@/lib/publicacionesLista'
import { actualizarCatalogo } from '@/lib/catalogoML'
import { puede } from '@/lib/permisos'
import { tieneModulo } from '@/lib/modulos'
import { avisosStock, itemsEnPromo, SQL_SIN_PESO, SQL_SIN_VINCULAR, type AvisoStock } from '@/lib/avisosPublicaciones'
import { SQL_POCA_VENTA } from '@/lib/visitasML'

const POR_PAGINA = 40

// GET /api/publicaciones?q=&cuenta=&estado=&pagina=&aviso= → las publicaciones de las cuentas conectadas (ml_catalogo).
// Fase 4 (18-11): cada fila trae sus avisos (stock, vincular, peso, promo; lib/avisosPublicaciones.ts) y arriba el
// conteo de cada uno para los filtros. Cada aviso solo si el usuario ve esa pantalla. &fresco=1 recalcula el stock.
// 20-11 (mig. 192): «visitas» = muchas visitas y pocas ventas en 30 días (lib/visitasML.ts); lo ve todo el que entra aquí.
const AVISOS = ['stock', 'vincular', 'peso', 'promo', 'visitas'] as const
type Aviso = typeof AVISOS[number]

export async function GET(req: NextRequest) {
  const s = await sesionPublicaciones()
  if ('error' in s) return s.error
  const p = req.nextUrl.searchParams
  const pagina = Math.max(1, Number(p.get('pagina')) || 1)
  const u = s.session.user
  const ve: Record<Aviso, boolean> = {
    stock: tieneModulo(u, 'inventario') && puede(u, 'ver_inventario'),
    vincular: puede(u, 'vincular_ml') || (puede(u, 'ver_productos') && puede(u, 'importar_ml')),
    peso: u.country === 'VE' && tieneModulo(u, 'inventario') && puede(u, 'ver_productos'),
    promo: u.country === 'VE' && tieneModulo(u, 'promociones') && puede(u, 'promociones') && puede(u, 'ver_productos'),
    visitas: true,
  }
  const avisoPedido = AVISOS.find(a => a === p.get('aviso') && ve[a]) ?? null
  try {
    const [stock, promo] = await Promise.all([
      ve.stock ? avisosStock(s.db, u.empresaId, u.country, p.get('fresco') === '1').catch(() => new Map<string, AvisoStock>()) : Promise.resolve(new Map<string, AvisoStock>()),
      ve.promo ? itemsEnPromo(s.db).catch(() => new Map<string, string[]>()) : Promise.resolve(new Map<string, string[]>()),
    ])
    const w = whereFiltro({ q: p.get('q') ?? '', cuenta: Number(p.get('cuenta')) || null, estado: p.get('estado') })
    // Los arrays de ids (stock, promo) van como parámetro solo si se ven: cada $n debe usarse en la consulta.
    const args = [...w.args]
    const cond: Partial<Record<Aviso, string>> = {}
    if (ve.stock) { args.push([...stock.keys()]); cond.stock = `m.item_id = ANY($${args.length}::text[])` }
    if (ve.promo) { args.push([...promo.keys()]); cond.promo = `m.item_id = ANY($${args.length}::text[])` }
    if (ve.vincular) cond.vincular = SQL_SIN_VINCULAR
    if (ve.peso) cond.peso = SQL_SIN_PESO
    cond.visitas = SQL_POCA_VENTA
    const extra = avisoPedido ? ` AND ${cond[avisoPedido]}` : ''
    // 18-11 (caída de la lista en prod): Postgres exige que cada parámetro enviado aparezca en la consulta. Los arrays de
    // stock/promo se mandan siempre que se ven, así que la lista también los nombra (como columnas), haya filtro o no.
    const cols = `${ve.vincular ? SQL_SIN_VINCULAR : 'FALSE'} AS sin_vincular, ${ve.peso ? SQL_SIN_PESO : 'FALSE'} AS sin_peso`
      + `, COALESCE(${SQL_POCA_VENTA}, FALSE) AS poca_venta`
      + (cond.stock ? `, ${cond.stock} AS _st` : '') + (cond.promo ? `, ${cond.promo} AS _pr` : '')
    const conteos = AVISOS.filter(a => cond[a]).map(a => `, COUNT(*) FILTER (WHERE ${cond[a]})::int AS ${a}`).join('')
    // Con un aviso pedido, la lista se filtra; los conteos de los filtros siguen siendo de toda la búsqueda.
    const [{ rows }, { rows: [t] }, { rows: cuentas }] = await Promise.all([
      s.db.query(
        `SELECT m.item_id, m.titulo, m.precio::float AS precio, m.moneda, m.disponible, m.estado, m.thumbnail, m.permalink, m.sku,
                k.nickname AS cuenta, COALESCE(jsonb_array_length(m.variantes), 0) AS variantes, m.visitas_30d, m.ventas_30d,
                (SELECT MAX(c.creado_at) FROM ml_publicacion_cambios c WHERE c.item_id = m.item_id AND c.ok) AS editada_at, ${cols}
         ${w.sql}${extra} ORDER BY m.sin_movimiento, m.estado, m.titulo LIMIT ${POR_PAGINA} OFFSET ${(pagina - 1) * POR_PAGINA}`, args),
      s.db.query(`SELECT COUNT(*)::int AS todas, COUNT(*) FILTER (WHERE TRUE${extra})::int AS n${conteos} ${w.sql}`, args),
      s.db.query(`SELECT id, nickname FROM ml_conexiones WHERE estado = 'activa' ORDER BY nickname`),
    ])
    const filas = rows.map(({ _st, _pr, ...r }) => {
      void _st; void _pr
      const st = stock.get(r.item_id)
      return { ...r, stock: st ? { nivel: st.nivel, code: st.code, disponible: st.disponible, pubs: st.pubs } : null, promo: promo.get(r.item_id) ?? null }
    })
    const { n, todas, ...avisos } = t
    return NextResponse.json({ filas, total: n, todas, porPagina: POR_PAGINA, cuentas, avisos, aviso: avisoPedido,
                               puedeIgualar: ve.stock && puede(u, 'reponer_stock') })
  } catch (err) {
    return apiError(err)
  }
}

// POST /api/publicaciones → relee YA de MercadoLibre el catálogo de todas las cuentas (08-11, el dueño: las recién
// publicadas no salían hasta la vuelta automática de cada 6 horas).
export async function POST() {
  const s = await sesionPublicaciones()
  if ('error' in s) return s.error
  try {
    const { rows } = await s.db.query(`SELECT id FROM ml_conexiones WHERE estado = 'activa'`)
    let n = 0
    for (const c of rows) n += (await actualizarCatalogo(s.db, c.id, true).catch(() => null)) ?? 0
    return NextResponse.json({ ok: true, leidas: n })
  } catch (err) {
    return apiError(err)
  }
}
