// Fotos de los productos (13-11-2026, el dueño, mig. 173). UNA sola regla para todo el sistema (Productos, Inventario,
// Compras, Importaciones, Ventas): la foto propia subida en Productos → la de su VARIANTE en MercadoLibre → la de su
// publicación → ninguna («Sin foto» gris en pantalla). Si el producto está en varias publicaciones (varias cuentas),
// siempre la misma: la activa con más unidades. Las de ML se muestran desde MercadoLibre (no ocupan disco).
import type { Pool } from 'pg'
import path from 'path'
import { mkdir, readFile, unlink, writeFile } from 'fs/promises'
import { randomBytes } from 'crypto'

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? './uploads'
const DIR = path.join(UPLOAD_DIR, 'productos')

/** { product_id: url } de todos los productos de la empresa (los sin foto no vienen). ~20 ms con 500 productos. */
export async function fotosProductos(db: Pick<Pool, 'query'>): Promise<Record<number, string>> {
  const { rows } = await db.query(`
    SELECT p.id, CASE WHEN p.foto_path IS NOT NULL THEN '/api/products/' || p.id || '/foto?v=' || floor(extract(epoch FROM p.foto_at))::bigint
                      ELSE ml.url END AS url
    FROM products p
    LEFT JOIN LATERAL (
      SELECT COALESCE((SELECT v->>'foto' FROM jsonb_array_elements(c.variantes) v WHERE v->>'id' = split_part(m.ml_code, ':', 2)), c.thumbnail) AS url
      FROM product_ml_codes m
      JOIN ml_catalogo c ON c.item_id IN ('MLV' || split_part(m.ml_code, ':', 1), 'MCO' || split_part(m.ml_code, ':', 1))
      WHERE m.product_id = p.id AND m.is_active
      ORDER BY c.estado = 'active' DESC, c.disponible DESC, c.item_id LIMIT 1) ml ON TRUE`)
  const out: Record<number, string> = {}
  for (const r of rows) if (r.url) out[r.id] = r.url
  return out
}

/** Guarda la foto propia (ya achicada en el navegador) y borra la anterior. */
export async function guardarFotoPropia(db: Pick<Pool, 'query'>, productId: number, datos: Buffer, ext: 'jpg' | 'webp') {
  await mkdir(DIR, { recursive: true })
  const p = path.join(DIR, `${productId}-${randomBytes(8).toString('hex')}.${ext}`)
  await writeFile(p, datos)
  const { rows: [antes] } = await db.query(`SELECT foto_path FROM products WHERE id = $1`, [productId])
  const { rowCount } = await db.query(`UPDATE products SET foto_path = $2, foto_at = NOW() WHERE id = $1`, [productId, p])
  if (!rowCount) { await unlink(p).catch(() => {}); return false }
  if (antes?.foto_path) await unlink(antes.foto_path).catch(() => {})
  return true
}

/** Quita la foto propia: vuelve a usarse la de MercadoLibre. */
export async function quitarFotoPropia(db: Pick<Pool, 'query'>, productId: number) {
  const { rows: [antes] } = await db.query(`SELECT foto_path FROM products WHERE id = $1`, [productId])
  await db.query(`UPDATE products SET foto_path = NULL, foto_at = NULL WHERE id = $1`, [productId])
  if (antes?.foto_path) await unlink(antes.foto_path).catch(() => {})
}

export async function leerFotoPropia(db: Pick<Pool, 'query'>, productId: number) {
  const { rows: [r] } = await db.query(`SELECT foto_path FROM products WHERE id = $1`, [productId])
  if (!r?.foto_path || !String(r.foto_path).startsWith(DIR)) return null
  const ext = String(r.foto_path).split('.').pop()
  return { datos: await readFile(r.foto_path), tipo: ext === 'webp' ? 'image/webp' : 'image/jpeg' }
}
