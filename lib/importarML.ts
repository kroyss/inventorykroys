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
  thumbnail: string | null
  permalink: string | null
  estado: EstadoImportar
  producto: { id: number; code: string; name: string; toda: boolean } | null   // vinculada (toda = por la publicación) o parecida
}

export async function filasImportar(db: Pool): Promise<FilaImportar[]> {
  const { rows: cat } = await db.query(
    `SELECT c.item_id, c.titulo, c.precio::float AS precio, c.moneda, c.disponible, c.estado, c.permalink,
            c.thumbnail, c.sku, c.variantes, x.nickname AS cuenta
     FROM ml_catalogo c JOIN ml_conexiones x ON x.id = c.conexion_id
     ORDER BY c.estado = 'active' DESC, c.titulo`)
  const filas: (FilaImportar & { sku: string | null })[] = []
  for (const c of cat) {
    const pub = String(c.item_id).replace(/^[A-Z]{3}/, '')
    const base = { item_id: c.item_id, cuenta: c.cuenta, titulo: c.titulo, precio: c.precio, moneda: c.moneda,
      estado_ml: c.estado, thumbnail: c.thumbnail, permalink: c.permalink, estado: 'nueva' as EstadoImportar, producto: null }
    const vars = (c.variantes as VarianteCatalogo[] | null) ?? []
    if (vars.length) {
      for (const v of vars) filas.push({ ...base, codigo: `${pub}:${v.id}`, variante: v.nombre, disponible: v.disponible, sku: v.sku ?? c.sku })
    } else {
      filas.push({ ...base, codigo: pub, variante: null, disponible: c.disponible, sku: c.sku })
    }
  }
  if (!filas.length) return []

  // Vinculadas: por el código exacto o por el de toda la publicación.
  const { rows: cods } = await db.query(
    `SELECT DISTINCT ON (m.ml_code) m.ml_code, p.id, p.code, p.name
     FROM product_ml_codes m JOIN products p ON p.id = m.product_id
     WHERE m.is_active AND p.is_active AND split_part(m.ml_code, ':', 1) = ANY($1::text[])
     ORDER BY m.ml_code, p.code`, [[...new Set(filas.map(f => f.codigo.split(':')[0]))]])
  const porCodigo = new Map(cods.map(r => [r.ml_code as string, { id: r.id as number, code: r.code as string, name: r.name as string }]))
  for (const f of filas) {
    const exacto = porCodigo.get(f.codigo)
    const dePub = f.codigo.includes(':') ? porCodigo.get(f.codigo.split(':')[0]) : undefined
    const p = exacto ?? dePub
    if (p) { f.estado = 'vinculada'; f.producto = { ...p, toda: !exacto } }
  }

  // Parecidas: SKU = código del producto, o nombre parecido (trigramas). Solo productos SIN código ML
  // en esa publicación (los que ya están vinculados a otra cosa igual pueden aparecer: un producto
  // puede estar en varias publicaciones).
  const libres = filas.filter(f => f.estado === 'nueva')
  if (libres.length) {
    // `%` usa el índice de trigramas (migración 082) con este umbral; la conexión es del request.
    await db.query(`SELECT set_limit($1)`, [SIMILITUD_MIN])
    const { rows: par } = await db.query(
      `SELECT f.codigo, p.id, p.code, p.name
       FROM unnest($1::text[], $2::text[], $3::text[]) AS f(codigo, titulo, sku)
       CROSS JOIN LATERAL (
         SELECT p.id, p.code, p.name FROM products p
         WHERE p.is_active AND (p.name % f.titulo OR (f.sku IS NOT NULL AND lower(p.code) = lower(f.sku)))
         ORDER BY lower(p.code) = lower(COALESCE(f.sku, '')) DESC, similarity(p.name, f.titulo) DESC
         LIMIT 1) p`,
      [libres.map(f => f.codigo), libres.map(f => f.variante ? `${f.titulo} ${f.variante}` : f.titulo),
       libres.map(f => f.sku)])
    const parecido = new Map(par.map(r => [r.codigo as string, { id: r.id as number, code: r.code as string, name: r.name as string, toda: false }]))
    for (const f of libres) {
      const p = parecido.get(f.codigo)
      if (p) { f.estado = 'parecida'; f.producto = p }
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

export interface NuevoProducto { codigo: string; cuenta: string; nombre: string; costo: number | null; stock: number; precio: number | null }

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
      const costo = p.costo ?? 0
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
