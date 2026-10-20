// Vincular publicaciones de ML (20-10, migración 109; pantalla /vincular-ml). Un empleado une cada publicación —o
// cada VARIANTE: en este negocio cada color/modelo es un producto aparte ("Guantes - Azul")— con su producto, a mano
// y de a una. El sistema solo SUGIERE (lib/importarML.ts: el producto parecido o el mismo SKU); no vincula nada solo.
// Código guardado como siempre en product_ml_codes: "768007052" (publicación) o "768007052:180012345" (variante).
// Orden: lo que más se vendió en 60 días primero. Sin precios ni costos para quien no tiene "costos".
import type { Pool } from 'pg'
import { filasImportar, vincularCodigo, type FilaImportar } from '@/lib/importarML'

export interface FilaVincular extends Omit<FilaImportar, 'precio' | 'moneda'> {
  precio?: number | null; moneda?: string | null
  ventas60: number
  vinculado_por: string | null; vinculado_at: string | null
  propio: boolean        // lo vinculó quien está mirando (puede deshacerlo)
  duda: { id: number; nota: string; por: string | null; creada_at: string } | null
}

const DIAS_VENTAS = 60

export async function filasVincular(db: Pool, conPrecios: boolean, userId: number): Promise<FilaVincular[]> {
  const [filas, { rows: ventas }, { rows: quien }, { rows: dudas }] = await Promise.all([
    filasImportar(db),
    // ml_ordenes.items guarda "MLV768007052" y, si es variante, también "MLV768007052:180012345".
    db.query(
      `SELECT regexp_replace(c, '^[A-Z]{3}', '') AS cod, COUNT(*)::int AS n
       FROM ml_ordenes o, unnest(o.items) c
       WHERE o.fecha > NOW() - make_interval(days => $1) AND o.estado <> 'cancelled'
       GROUP BY 1`, [DIAS_VENTAS]),
    db.query(
      `SELECT DISTINCT ON (m.ml_code) m.ml_code, m.vinculado_at, m.vinculado_por, COALESCE(u.full_name, u.username) AS por
       FROM product_ml_codes m LEFT JOIN users u ON u.id = m.vinculado_por
       WHERE m.is_active ORDER BY m.ml_code, m.vinculado_at DESC NULLS LAST`),
    db.query(
      `SELECT d.id, d.codigo, d.nota, d.creada_at, COALESCE(u.full_name, u.username) AS por
       FROM ml_vinculo_dudas d LEFT JOIN users u ON u.id = d.por WHERE d.resuelta_at IS NULL`),
  ])
  const nVentas = new Map(ventas.map(v => [v.cod as string, v.n as number]))
  const porCodigo = new Map(quien.map(q => [q.ml_code as string, q]))
  const dudaDe = new Map(dudas.map(d => [d.codigo as string, d]))
  return filas.map(f => {
    const q = f.estado === 'vinculada' ? porCodigo.get(f.producto?.toda ? f.codigo.split(':')[0] : f.codigo) : undefined
    const d = dudaDe.get(f.codigo)
    const fila: FilaVincular = {
      ...f,
      ventas60: nVentas.get(f.codigo) ?? 0,
      vinculado_por: q?.por ?? null, vinculado_at: q?.vinculado_at ?? null, propio: !!q && q.vinculado_por === userId,
      duda: d ? { id: d.id, nota: d.nota, por: d.por, creada_at: d.creada_at } : null,
    }
    if (!conPrecios) { delete fila.precio; delete fila.moneda }
    return fila
  })
}

/** Productos para elegir: solo código, nombre y stock (sin precios). */
export async function productosParaVincular(db: Pool) {
  const { rows } = await db.query(
    `SELECT p.id, p.code, p.name, COALESCE(i.quantity, 0)::int AS stock
     FROM products p LEFT JOIN inventory i ON i.product_id = p.id
     WHERE p.is_active ORDER BY p.name`)
  return rows as { id: number; code: string; name: string; stock: number }[]
}

/** Vincula y deja registrado quién y cuándo; si había una duda de ese código, queda resuelta. */
export async function vincular(db: Pool, productId: number, cuenta: string, codigo: string, userId: number) {
  await vincularCodigo(db, productId, cuenta, codigo)
  await db.query(
    `UPDATE product_ml_codes SET vinculado_por = $3, vinculado_at = NOW(), desvinculado_por = NULL, desvinculado_at = NULL
     WHERE product_id = $1 AND ml_code = $2 AND is_active`, [productId, codigo, userId])
  await db.query(
    `UPDATE ml_vinculo_dudas SET resuelta_at = NOW(), resuelta_por = $2, resolucion = 'vinculada'
     WHERE codigo = $1 AND resuelta_at IS NULL`, [codigo, userId])
}

/** Desvincula (se desactiva el código, no se borra: queda quién y cuándo). */
export async function desvincular(db: Pool, productId: number, codigo: string, userId: number, soloPropios: boolean) {
  // Un empleado solo deshace lo que vinculó él (no los vínculos que ya existían o hizo otro).
  const { rowCount } = await db.query(
    `UPDATE product_ml_codes SET is_active = FALSE, desvinculado_por = $3, desvinculado_at = NOW()
     WHERE product_id = $1 AND ml_code = $2 AND is_active AND (NOT $4 OR vinculado_por = $3)`, [productId, codigo, userId, soloPropios])
  return rowCount ?? 0
}
