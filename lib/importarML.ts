// Importar productos desde MercadoLibre (2026-10-12, Productos → Primeros pasos).
//
// Es la puerta de ENTRADA al inventario (decisión del dueño): la primera vez se convierten las
// publicaciones en productos, y a SolucionesMC le sirve para completar los códigos ML que faltan.
// Después el camino es al revés (el producto entra por Compras, se publica y se vincula en Ventas →
// Por confirmar), así que no hay sincronización: se usa cuando hace falta.
//
// La lista sale de ml_catalogo (el refresco de lib/catalogoML.ts, sin llamadas nuevas a ML). Cada
// publicación, o cada VARIANTE (un producto por variante, para llevar el stock de cada una), queda en:
//   - vinculada: ya hay un producto con ese código (o con el de toda la publicación).
//   - parecida:  un producto se le parece (mismo SKU que su código, o el nombre parecido por trigramas).
//   - nueva:     no hay nada → se puede crear.
// Crear: próximo COD-XXXX, nombre = título (+ variante), precio = lo publicado, stock = lo que ML dice
// que hay, con su movimiento ("Ingreso inicial desde MercadoLibre") y marcado "stock por verificar".
import type { Pool, PoolClient } from 'pg'
import type { VarianteCatalogo } from '@/lib/catalogoML'

export type EstadoImportar = 'vinculada' | 'parecida' | 'nueva'
const SIMILITUD_MIN = 0.42

export interface FilaImportar {
  codigo: string                 // sin prefijo: "768007052" o "768007052:180012345"
  item_id: string                // MLV768007052
  cuenta: string
  titulo: string
  variante: string | null
  precio: number | null
  moneda: string | null
  disponible: number
  estado_ml: string | null       // active / paused
  sin_movimiento?: boolean       // pausada sin ventas ni preguntas en 90 días (migración 127)
  reciente?: boolean             // apareció en el catálogo en los últimos 15 días (mig. 173): «publicación nueva»
  thumbnail: string | null
  foto?: string | null   // 13-11: la de la variante (si ML la da) o la de la publicación
  permalink: string | null
  estado: EstadoImportar
  producto: { id: number; code: string; name: string; toda: boolean } | null   // vinculada (toda = por la publicación) o parecida
  /** Otros productos vinculados al MISMO código (21-10): antes solo se veía el primero y un vínculo de más quedaba escondido. */
  otros?: { id: number; code: string; name: string }[]
}

/** Trigramas como pg_trgm: por palabra (letras y números), en minúscula, con "  " delante y " " detrás. */
export function trigramas(texto: string) {
  const set = new Set<string>()
  for (const w of texto.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []) {
    const p = `  ${w} `
    for (let i = 0; i < p.length - 2; i++) set.add(p.slice(i, i + 3))
  }
  return set
}
export function similitud(a: Set<string>, b: Set<string>) {
  if (!a.size || !b.size) return 0
  let comunes = 0
  for (const t of a) if (b.has(t)) comunes++
  return comunes / (a.size + b.size - comunes)
}

/** El más parecido (índice en `productos`, o -1) con similitud ≥ SIMILITUD_MIN: el mismo resultado que comparar contra
 *  todos con `similitud` (empate → el último, como `>=` en orden), pero solo cuenta los productos que comparten algún
 *  trigrama (índice invertido). 12-11 (rapidez): Importar desde ML tardaba 1,9 s y trababa el servidor. */
export function indiceParecidos(productos: Set<string>[]) {
  const porTri = new Map<string, number[]>()
  productos.forEach((tri, i) => { for (const t of tri) { const l = porTri.get(t); if (l) l.push(i); else porTri.set(t, [i]) } })
  const comunes = new Int32Array(productos.length)
  return (t: Set<string>) => {
    if (!t.size) return -1
    const tocados: number[] = []
    for (const x of t) for (const i of porTri.get(x) ?? []) { if (comunes[i] === 0) tocados.push(i); comunes[i]++ }
    tocados.sort((a, b) => a - b)
    let max = SIMILITUD_MIN, mejor = -1
    for (const i of tocados) {
      const c = comunes[i], b = productos[i].size
      const sim = c / (t.size + b - c)
      if (sim >= max) { max = sim; mejor = i }
      comunes[i] = 0
    }
    return mejor
  }
}

/** `parecidas: false` (12-11): sin buscar parecidas por nombre (trigramas contra todos los productos, pesado de
 *  CPU y traba el servidor): para quien solo necesita saber cuáles están vinculadas (aviso de Stock en ML). */
export async function filasImportar(db: Pool, { parecidas = true } = {}): Promise<FilaImportar[]> {
  const { rows: cat } = await db.query(
    `SELECT c.item_id, c.titulo, c.precio::float AS precio, c.moneda, c.disponible, c.estado, c.permalink,
            c.thumbnail, c.sku, c.variantes, c.sin_movimiento, UPPER(x.nickname) AS cuenta,
            COALESCE(c.visto_at > NOW() - INTERVAL '15 days', false) AS reciente   -- como lib/mlCuentas (ficha del producto)
     FROM ml_catalogo c JOIN ml_conexiones x ON x.id = c.conexion_id
     ORDER BY c.estado = 'active' DESC, c.titulo`)
  const filas: (FilaImportar & { sku: string | null })[] = []
  for (const c of cat) {
    const pub = String(c.item_id).replace(/^[A-Z]{3}/, '')
    const base = { item_id: c.item_id, cuenta: c.cuenta, titulo: c.titulo, precio: c.precio, moneda: c.moneda,
      estado_ml: c.estado, sin_movimiento: !!c.sin_movimiento, reciente: !!c.reciente, thumbnail: c.thumbnail, permalink: c.permalink, estado: 'nueva' as EstadoImportar, producto: null }
    const vars = (c.variantes as VarianteCatalogo[] | null) ?? []
    if (vars.length) {
      for (const v of vars) filas.push({ ...base, foto: v.foto ?? c.thumbnail, codigo: `${pub}:${v.id}`, variante: v.nombre, disponible: v.disponible, sku: v.sku ?? c.sku })
    } else {
      filas.push({ ...base, foto: c.thumbnail, codigo: pub, variante: null, disponible: c.disponible, sku: c.sku })
    }
  }
  if (!filas.length) return []

  // Vinculadas: por el código exacto o por el de toda la publicación.
  const { rows: cods } = await db.query(
    `SELECT m.ml_code, p.id, p.code, p.name
     FROM product_ml_codes m JOIN products p ON p.id = m.product_id
     WHERE m.is_active AND p.is_active AND split_part(m.ml_code, ':', 1) = ANY($1::text[])
     ORDER BY m.ml_code, p.code`, [[...new Set(filas.map(f => f.codigo.split(':')[0]))]])
  const todosDe = new Map<string, { id: number; code: string; name: string }[]>()
  for (const r of cods) {
    const l = todosDe.get(r.ml_code) ?? []
    if (!l.some(x => x.id === r.id)) l.push({ id: r.id, code: r.code, name: r.name })
    todosDe.set(r.ml_code, l)
  }
  const porCodigo = new Map([...todosDe].map(([k, l]) => [k, l[0]]))
  for (const f of filas) {
    const exacto = porCodigo.get(f.codigo)
    const dePub = f.codigo.includes(':') ? porCodigo.get(f.codigo.split(':')[0]) : undefined
    const p = exacto ?? dePub
    if (p) {
      f.estado = 'vinculada'; f.producto = { ...p, toda: !exacto }
      const otros = (todosDe.get(exacto ? f.codigo : f.codigo.split(':')[0]) ?? []).slice(1)
      if (otros.length) f.otros = otros
    }
  }

  // Parecidas: SKU = código del producto, o nombre parecido (trigramas, como pg_trgm). Se calcula en
  // memoria: en SQL eran ~8 ms por publicación aun con índice (títulos de ML largos) → 3 s por lista.
  const libres = parecidas ? filas.filter(f => f.estado === 'nueva') : []
  if (libres.length) {
    const { rows: prods } = await db.query(`SELECT id, code, name FROM products WHERE is_active`)
    const conTri = prods.map(p => ({ id: p.id as number, code: p.code as string, name: p.name as string, tri: trigramas(p.name) }))
    const porSku = new Map(conTri.map(p => [p.code.toLowerCase(), p]))
    const parecido = indiceParecidos(conTri.map(p => p.tri))
    for (const f of libres) {
      let mejor = f.sku ? porSku.get(f.sku.toLowerCase()) : undefined
      if (!mejor) {
        const i = parecido(trigramas(f.variante ? `${f.titulo} ${f.variante}` : f.titulo))
        if (i >= 0) mejor = conTri[i]
      }
      if (mejor) { f.estado = 'parecida'; f.producto = { id: mejor.id, code: mejor.code, name: mejor.name, toda: false } }
    }
  }
  for (const f of filas) delete (f as { sku?: string | null }).sku   // el SKU solo servía para comparar
  return filas
}

/** Vincula un código ML (publicación o variante) a un producto existente. Solo agrega. */
export async function vincularCodigo(db: Pool | PoolClient, productId: number, cuenta: string, codigo: string) {
  const { rows: [ya] } = await db.query(
    `SELECT id, is_active FROM product_ml_codes WHERE product_id = $1 AND ml_code = $2 ORDER BY is_active DESC LIMIT 1`,
    [productId, codigo])
  if (ya) {
    if (!ya.is_active) await db.query(`UPDATE product_ml_codes SET is_active = TRUE WHERE id = $1`, [ya.id])
    return
  }
  await db.query(`INSERT INTO product_ml_codes (product_id, ml_account, ml_code, is_active) VALUES ($1, $2, $3, TRUE)`,
    [productId, cuenta, codigo])
}

export interface NuevoProducto { codigo: string; cuenta: string; nombre: string; costo: number; stock: number; precio: number | null }

/** Crea los productos en UNA transacción (o todos o ninguno). Salta los códigos que ya quedaron
 *  vinculados (doble clic, otra pestaña). Devuelve los códigos de producto creados. */
export async function crearProductos(db: PoolClient, lista: NuevoProducto[], userId: number) {
  await db.query('BEGIN')
  try {
    const { rows: [ult] } = await db.query(
      `SELECT COALESCE(MAX(CAST(SUBSTRING(code FROM 5) AS INTEGER)), 0) AS n FROM products WHERE code ~ '^COD-[0-9]+$'`)
    let n = Number(ult.n)
    const creados: string[] = []
    for (const p of lista) {
      const { rows: [ya] } = await db.query(
        `SELECT 1 FROM product_ml_codes m JOIN products x ON x.id = m.product_id
         WHERE m.is_active AND x.is_active AND m.ml_code = $1 LIMIT 1`, [p.codigo])
      if (ya) continue
      const code = `COD-${String(++n).padStart(4, '0')}`
      const costo = p.costo
      if (!(costo > 0)) throw new Error(`Falta el costo de «${p.nombre.slice(0, 60)}»`)
      const precio = p.precio ?? 0
      const { rows: [prod] } = await db.query(
        `INSERT INTO products (code, name, stock_por_verificar) VALUES ($1, $2, $3) RETURNING id`,
        [code, p.nombre.slice(0, 200), p.stock > 0])
      await db.query(
        `INSERT INTO product_pricing (product_id, base_cost, shipping_cost, total_cost, profit_category_id,
           base_price_usd, published_price_usd, final_price_usd, price_bolivares, current_discount_percent)
         VALUES ($1, $2, 0, $2, NULL, 0, $3, $3, 0, 0)`, [prod.id, costo, precio])
      await db.query(
        `INSERT INTO inventory (product_id, quantity, min_stock, max_stock, sale_price) VALUES ($1, $2, 0, 0, $3)`,
        [prod.id, p.stock, precio])
      if (p.stock > 0) {
        await db.query(
          `INSERT INTO inventory_movements (product_id, movement_type, quantity, reference, notes, created_by)
           VALUES ($1, 'ADJUST', $2, 'INGRESO-ML', $3, $4)`,
          [prod.id, p.stock, 'Ingreso inicial desde MercadoLibre (stock de la publicación, por verificar)', userId])
      }
      await vincularCodigo(db, prod.id, p.cuenta, p.codigo)
      creados.push(code)
    }
    await db.query('COMMIT')
    return creados
  } catch (e) {
    await db.query('ROLLBACK')
    throw e
  }
}

/** Cuántas publicaciones (o variantes) activas y con unidades en ML no están vinculadas a ningún producto (12-11, el
 *  aviso de Stock en ML). Mismo criterio que filasImportar (código exacto o el de toda la publicación) pero contado en
 *  la base: antes se traía el catálogo entero (~900 kB) para contar. */
export async function contarSinVincular(db: Pool): Promise<number> {
  const { rows: [r] } = await db.query(
    `WITH filas AS (
       SELECT substring(c.item_id FROM 4) AS pub, v->>'id' AS var,
              CASE WHEN v IS NULL THEN c.disponible ELSE (v->>'disponible')::int END AS disp
       FROM ml_catalogo c JOIN ml_conexiones x ON x.id = c.conexion_id
       LEFT JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(c.variantes) = 'array' THEN c.variantes ELSE '[]'::jsonb END) v ON TRUE
       WHERE c.estado = 'active'),
     vinc AS (SELECT DISTINCT m.ml_code FROM product_ml_codes m JOIN products p ON p.id = m.product_id WHERE m.is_active AND p.is_active)
     SELECT COUNT(*)::int AS n FROM filas f
     LEFT JOIN vinc v1 ON v1.ml_code = f.pub || COALESCE(':' || f.var, '')
     LEFT JOIN vinc v2 ON v2.ml_code = f.pub
     WHERE f.disp > 0 AND v1.ml_code IS NULL AND v2.ml_code IS NULL`)
  return r?.n ?? 0
}
