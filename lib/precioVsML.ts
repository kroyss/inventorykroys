// Publicaciones → «Precio vs sistema» (22-11-2026, pedido del dueño; módulo `precio_vs_ml`, mig 195).
// Cada publicación de ML vinculada a productos: su precio de LISTA en ML contra el precio del sistema.
//   - Precio sistema (decisión del dueño 22-11): el «Precio con exceso ML» en USD, calculado AHORA (costo total ×
//     (1 + recargo %) × (1 + exceso %)), SIN descuento: el descuento lo pone la promoción en ML. Es livePublishedVE (la
//     misma cuenta de la ficha). Sin «precios_categorias» (inventario simple) el precio del sistema es lo publicado guardado.
//   - MercadoLibre Venezuela publica en USD (ml_catalogo.precio = precio de lista, sin la promo). Se compara en USD.
//   - «Trae N u.» (combo): el precio del sistema es N × el del producto (se marca «Combo»; en lote no va por defecto).
//   - Una publicación con variantes vinculadas a productos con precios distintos tiene UN solo precio en ML: no se compara.
//   - Bien = diferencia de 1 % o menos (decisión del dueño: margen por decimales).
//   - Promoción activa (foto de Promociones): para cambiarle el precio primero se la SACA de sus promociones (la cola lo
//     hace antes del precio) y después hay que volver a meterla desde Promociones (los descuentos y precios cambian).
// Los precios viajan como número con punto (JSON) y se redondean a 2 decimales: nunca se parsea un texto con coma.
import type { Pool } from 'pg'
import { livePublishedVE } from '@/lib/pricingVE'
import { excesoEmpresa } from '@/lib/rateUtils'
import { sinEnteraVieja } from '@/lib/vinculoEntero'

export const TOLERANCIA_PCT = 1

export interface PromoActiva { id: string; tipo: string; nombre: string | null; precio: number | null }
export interface ProductoDePub { product_id: number; code: string; name: string; unidades: number; variante: string | null; precio: number | null }
export type EstadoPrecio = 'bien' | 'barato' | 'caro' | 'sin_dato'
export type MotivoSinDato = 'sin_costo' | 'precios_distintos' | 'otra_moneda' | 'sin_precio_ml'

export interface FilaPrecioML {
  item_id: string
  conexion_id: number
  cuenta: string
  titulo: string | null
  estado_ml: string | null
  moneda: string | null
  foto: string | null
  permalink: string | null
  precio_ml: number | null
  precio_sistema: number | null
  /** precio_ml − precio_sistema (USD) y en % del sistema. */
  diferencia: number | null
  pct: number | null
  estado: EstadoPrecio
  motivo: MotivoSinDato | null
  combo: boolean
  /** «No sincronizar» (rifas, encargos): el precio puede ser distinto a propósito. */
  aparte: boolean
  productos: ProductoDePub[]
  promos: PromoActiva[]
}

const r2 = (n: number) => Math.round(n * 100) / 100

/** Promociones ACTIVAS (started) de cada publicación, de la última foto de Promociones. 22-11 (rapidez, 1,2 s → 20 ms):
 *  las promos y los nombres de campaña en dos lecturas y se unen aquí (buscar la campaña dentro del JSON por cada promo
 *  recorría la lista entera cada vez). */
export async function promosActivas(db: Pick<Pool, 'query'>): Promise<Map<string, PromoActiva[]>> {
  const [{ rows }, { rows: camps }] = await Promise.all([
    db.query<{ item: string; id: string; conexion_id: number; precio: number | null }>(
      `SELECT i->>'id' AS item, pr->>'campana' AS id, c.conexion_id,
              CASE WHEN jsonb_typeof(pr->'precio') = 'number' THEN (pr->>'precio')::float END AS precio
       FROM ml_promociones_cache c
       JOIN ml_conexiones x ON x.id = c.conexion_id AND x.estado = 'activa'
       CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(c.datos->'items') = 'array' THEN c.datos->'items' ELSE '[]'::jsonb END) i
       CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(i->'promos') = 'array' THEN i->'promos' ELSE '[]'::jsonb END) pr
       WHERE pr->>'estado' = 'started'`),
    db.query<{ conexion_id: number; id: string; tipo: string | null; nombre: string | null }>(
      `SELECT c.conexion_id, ca->>'id' AS id, ca->>'tipo' AS tipo, ca->>'nombre' AS nombre
       FROM ml_promociones_cache c
       CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(c.datos->'campanas') = 'array' THEN c.datos->'campanas' ELSE '[]'::jsonb END) ca`),
  ])
  const campana = new Map<string, { tipo: string | null; nombre: string | null }>()
  for (const c of camps) if (!campana.has(`${c.conexion_id}|${c.id}`)) campana.set(`${c.conexion_id}|${c.id}`, c)
  const m = new Map<string, PromoActiva[]>()
  for (const r of rows) {
    if (!r.id) continue
    const l = m.get(r.item) ?? []
    const c = campana.get(`${r.conexion_id}|${r.id}`)
    if (!l.some(p => p.id === r.id)) l.push({ id: r.id, tipo: c?.tipo ?? 'DEAL', nombre: c?.nombre ?? null, precio: r.precio })
    m.set(r.item, l)
  }
  return m
}

export async function filasPrecioML(db: Pool, conCategorias: boolean, promosLeidas?: Map<string, PromoActiva[]>): Promise<FilaPrecioML[]> {
  const [{ rows }, exceso, promos] = await Promise.all([
    db.query(
      `SELECT c.item_id, c.conexion_id, k.nickname AS cuenta, c.titulo, c.estado, c.moneda, c.thumbnail, c.permalink,
              c.precio::float AS precio, c.variantes,
              p.id AS product_id, p.code, p.name, COALESCE(m.unidades, 1)::int AS unidades,
              COALESCE(m.sin_sincronizar, FALSE) AS sin_sincronizar, split_part(m.ml_code, ':', 2) AS var_id,
              COALESCE(pp.total_cost, 0)::float AS total_cost,
              COALESCE(pp.ganancia_pct, pc.profit_percentage, 0)::float AS profit_percentage,
              pp.published_price_usd::float AS publicado
       FROM product_ml_codes m
       JOIN products p ON p.id = m.product_id AND p.is_active
       JOIN ml_catalogo c ON substring(c.item_id FROM 4) = split_part(m.ml_code, ':', 1)
       JOIN ml_conexiones k ON k.id = c.conexion_id AND k.estado = 'activa'
       LEFT JOIN product_pricing pp ON pp.product_id = p.id
       LEFT JOIN profit_categories pc ON pc.id = pp.profit_category_id
       WHERE m.is_active AND split_part(m.ml_code, ':', 1) ~ '^\\d+$' AND ${sinEnteraVieja('m')}
       ORDER BY c.titulo, c.item_id, p.code`),
    excesoEmpresa(db),
    promosLeidas ?? promosActivas(db).catch(() => new Map<string, PromoActiva[]>()),
  ])

  const porItem = new Map<string, FilaPrecioML>()
  for (const r of rows) {
    let f = porItem.get(r.item_id)
    if (!f) {
      f = { item_id: r.item_id, conexion_id: r.conexion_id, cuenta: r.cuenta, titulo: r.titulo, estado_ml: r.estado ?? null,
            moneda: r.moneda ?? null, foto: r.thumbnail ?? null, permalink: r.permalink ?? null,
            precio_ml: r.precio != null && r.precio > 0 ? r.precio : null, precio_sistema: null, diferencia: null, pct: null,
            estado: 'sin_dato', motivo: null, combo: false, aparte: false, productos: [], promos: promos.get(r.item_id) ?? [] }
      porItem.set(r.item_id, f)
    }
    const unidades = Math.max(1, r.unidades)
    const unitario = conCategorias
      ? (r.total_cost > 0 ? livePublishedVE({ total_cost: r.total_cost, profit_percentage: r.profit_percentage }, exceso) : null)
      : (r.publicado > 0 ? r.publicado : null)
    const variantes: { id: number; nombre: string | null }[] = Array.isArray(r.variantes) ? r.variantes : []
    const variante = r.var_id ? (variantes.find(v => String(v.id) === r.var_id)?.nombre ?? `Variante ${r.var_id}`) : null
    if (f.productos.some(x => x.product_id === r.product_id && x.variante === variante)) continue
    f.productos.push({ product_id: r.product_id, code: r.code, name: r.name, unidades, variante,
                       precio: unitario != null ? r2(unitario * unidades) : null })
    if (unidades > 1) f.combo = true
    if (r.sin_sincronizar) f.aparte = true
  }

  for (const f of porItem.values()) {
    const precios = f.productos.map(p => p.precio)
    if (f.precio_ml == null) f.motivo = 'sin_precio_ml'
    else if (f.moneda && f.moneda !== 'USD') f.motivo = 'otra_moneda'
    else if (precios.some(p => p == null)) f.motivo = 'sin_costo'
    else {
      const min = Math.min(...(precios as number[])), max = Math.max(...(precios as number[]))
      // Variantes de productos distintos: en ML es un solo precio. Si difieren más que la tolerancia, no se compara.
      if (max > 0 && (max - min) / min * 100 > TOLERANCIA_PCT) f.motivo = 'precios_distintos'
      else f.precio_sistema = max
    }
    if (f.precio_sistema != null && f.precio_ml != null && f.precio_sistema > 0) {
      f.diferencia = r2(f.precio_ml - f.precio_sistema)
      f.pct = Math.round((f.precio_ml - f.precio_sistema) / f.precio_sistema * 1000) / 10
      f.estado = Math.abs((f.precio_ml - f.precio_sistema) / f.precio_sistema * 100) <= TOLERANCIA_PCT ? 'bien'
        : f.precio_ml < f.precio_sistema ? 'barato' : 'caro'
    }
  }
  return [...porItem.values()]
}

/** Publicaciones a las que se les sacaron las promociones al cambiar el precio desde aquí (30 días) y que todavía no
 *  volvieron a esas campañas ni se marcaron «Ya las revisé». */
export interface PorRestaurar {
  lote_id: number; item_id: string; titulo: string | null; cuenta: string | null; fecha: string
  precio_antes: number | null; precio_nuevo: number | null; promos: PromoActiva[]
}
export async function porRestaurar(db: Pool, activas: Map<string, PromoActiva[]>): Promise<PorRestaurar[]> {
  const { rows } = await db.query(
    `SELECT i.lote_id::int, i.item_id, c.titulo, k.nickname AS cuenta, COALESCE(i.hecho_at, l.creado_at) AS fecha,
            (i.datos->>'precio_antes')::float AS precio_antes, (i.datos->>'precio_nuevo')::float AS precio_nuevo, i.datos->'promos' AS promos
     FROM ml_pub_lote_items i
     JOIN ml_pub_lotes l ON l.id = i.lote_id
     LEFT JOIN ml_catalogo c ON c.item_id = i.item_id
     LEFT JOIN ml_conexiones k ON k.id = c.conexion_id
     WHERE l.tipo = 'precio' AND l.parametros->>'origen' = 'precio_vs_ml' AND i.estado = 'ok'
       AND l.creado_at > NOW() - INTERVAL '30 days'
       AND jsonb_typeof(i.datos->'promos') = 'array' AND jsonb_array_length(i.datos->'promos') > 0
       AND NOT COALESCE((i.datos->>'restaurada')::boolean, FALSE)
     ORDER BY fecha DESC LIMIT 300`)
  return rows.map(r => ({ ...r, promos: (r.promos as PromoActiva[]).filter(p => !(activas.get(r.item_id) ?? []).some(a => a.id === p.id)) }))
    .filter(r => r.promos.length > 0)
}
