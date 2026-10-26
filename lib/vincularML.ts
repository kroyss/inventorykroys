// Vincular publicaciones de ML (20-10, migración 109; pantalla /vincular-ml). Un empleado une cada publicación —o
// cada VARIANTE: en este negocio cada color/modelo es un producto aparte ("Guantes - Azul")— con su producto, a mano
// y de a una. El sistema solo SUGIERE (lib/importarML.ts: el producto parecido o el mismo SKU); no vincula nada solo.
// Código guardado como siempre en product_ml_codes: "768007052" (publicación) o "768007052:180012345" (variante).
// Orden: lo que más se vendió en 60 días primero. Sin precios ni costos para quien no tiene "costos".
import type { Pool } from 'pg'
import { filasImportar, vincularCodigo, type FilaImportar } from '@/lib/importarML'
import { conflictoPesos, type ConflictoPesos, type PesoVinculado } from '@/lib/mlShipping'
import { leerTablasEnvio } from '@/lib/mlShippingDb'
import { sqlPesosVinculados } from '@/lib/promocionesSesion'
import { mlFetch } from '@/lib/ml'

export interface FilaVincular extends Omit<FilaImportar, 'precio' | 'moneda'> {
  precio?: number | null; moneda?: string | null
  ventas60: number
  vinculado_por: string | null; vinculado_at: string | null
  propio: boolean        // lo vinculó quien está mirando (puede deshacerlo)
  duda: { id: number; nota: string; por: string | null; creada_at: string } | null
  /** Vinculada a varios productos de distinto peso y el envío gratis cambia según cuál (21-10): casi siempre un vínculo de más. */
  conflicto?: ConflictoPesos | null
  /** Marcada "No se usa" (26-10, migración 124): sale de "Por vincular". */
  no_usa: { por: string | null; creada_at: string } | null
}

const DIAS_VENTAS = 60

export async function filasVincular(db: Pool, conPrecios: boolean, userId: number): Promise<FilaVincular[]> {
  const [filas, { rows: ventas }, { rows: quien }, { rows: dudas }, { rows: noUsa }] = await Promise.all([
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
    db.query(
      `SELECT x.codigo, x.creada_at, COALESCE(u.full_name, u.username) AS por
       FROM ml_variantes_descartadas x LEFT JOIN users u ON u.id = x.por WHERE x.motivo = 'no_usa'`),
  ])
  const noUsaDe = new Map(noUsa.map(x => [x.codigo as string, x]))
  const nVentas = new Map(ventas.map(v => [v.cod as string, v.n as number]))
  const porCodigo = new Map(quien.map(q => [q.ml_code as string, q]))
  const dudaDe = new Map(dudas.map(d => [d.codigo as string, d]))
  // Pesos de las publicaciones con más de un producto (pocas): para el aviso de envío gratis.
  const multiples = filas.filter(f => f.otros?.length && !f.codigo.includes(':') && (f.moneda ?? 'USD') === 'USD')
  const [pesos, tablas] = multiples.length ? await Promise.all([
    db.query(`SELECT x AS item, ${sqlPesosVinculados('x')} AS pesos FROM unnest($1::text[]) x`, [multiples.map(f => f.item_id)])
      .then(r => new Map(r.rows.map(x => [x.item as string, x.pesos as PesoVinculado[] | null]))),
    leerTablasEnvio(db),
  ]) : [new Map<string, PesoVinculado[] | null>(), undefined]
  return filas.map(f => {
    const q = f.estado === 'vinculada' ? porCodigo.get(f.producto?.toda ? f.codigo.split(':')[0] : f.codigo) : undefined
    const d = dudaDe.get(f.codigo)
    const fila: FilaVincular = {
      ...f,
      ventas60: nVentas.get(f.codigo) ?? 0,
      vinculado_por: q?.por ?? null, vinculado_at: q?.vinculado_at ?? null, propio: !!q && q.vinculado_por === userId,
      duda: d ? { id: d.id, nota: d.nota, por: d.por, creada_at: d.creada_at } : null,
      conflicto: f.otros?.length ? conflictoPesos(pesos.get(f.item_id), f.precio, tablas) : null,
      no_usa: noUsaDe.has(f.codigo) ? { por: noUsaDe.get(f.codigo)!.por, creada_at: noUsaDe.get(f.codigo)!.creada_at } : null,
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

// ── Variantes viejas (26-10, migración 124) ─────────────────────────────────────────────────────────────────────
/** "No se usa" (o deshacerlo): solo en el sistema, ML no se toca. */
export async function marcarNoUsa(db: Pool, codigo: string, cuenta: string | null, titulo: string | null, variante: string | null,
                                  valor: boolean, userId: number) {
  if (!valor) { await db.query(`DELETE FROM ml_variantes_descartadas WHERE codigo = $1 AND motivo = 'no_usa'`, [codigo]); return }
  await db.query(
    `INSERT INTO ml_variantes_descartadas (codigo, cuenta, titulo, variante, motivo, por) VALUES ($1, $2, $3, $4, 'no_usa', $5)
     ON CONFLICT (empresa_id, codigo, motivo) DO NOTHING`, [codigo, cuenta, titulo, variante, userId])
}

interface ItemVariantes { id: string; variations?: { id: number; available_quantity: number }[] }

/** Elimina UNA variante de la publicación en MercadoLibre. Se relee ML antes: solo si existe, tiene 0 unidades y no es
 *  la única. Después se relee para confirmar y se saca del catálogo guardado (sin esperar la actualización de 6 h). */
export async function eliminarVarianteML(db: Pool, codigo: string, userId: number): Promise<{ ok: true } | { ok: false; error: string }> {
  const [pub, vid] = codigo.split(':')
  if (!vid) return { ok: false, error: 'Solo se eliminan variantes, no la publicación entera' }
  const { rows: [c] } = await db.query(
    `SELECT c.conexion_id, c.item_id, c.titulo, x.nickname,
            (SELECT v->>'nombre' FROM jsonb_array_elements(c.variantes) v WHERE v->>'id' = $2) AS variante
     FROM ml_catalogo c JOIN ml_conexiones x ON x.id = c.conexion_id
     WHERE c.item_id ~ '^[A-Z]{3}' AND regexp_replace(c.item_id, '^[A-Z]{3}', '') = $1 LIMIT 1`, [pub, vid])
  if (!c) return { ok: false, error: 'No se encontró la publicación' }
  const ruta = `/items/${c.item_id}?attributes=id,variations`
  const antes = await mlFetch<ItemVariantes>(db, c.conexion_id, ruta)
  const v = antes.variations?.find(x => String(x.id) === vid)
  if (!v) {
    await quitarDelCatalogo(db, c.item_id, vid)
    return { ok: false, error: 'Esa variante ya no existe en MercadoLibre (se quitó de la lista)' }
  }
  if (v.available_quantity > 0) return { ok: false, error: `En ML tiene ${v.available_quantity} unidades: primero ponla en 0` }
  if ((antes.variations?.length ?? 0) < 2) return { ok: false, error: 'Es la única variante de la publicación: MercadoLibre no deja eliminarla' }
  await mlFetch(db, c.conexion_id, `/items/${c.item_id}/variations/${vid}`, { method: 'DELETE' })
  const despues = await mlFetch<ItemVariantes>(db, c.conexion_id, ruta)
  if (despues.variations?.some(x => String(x.id) === vid)) return { ok: false, error: 'MercadoLibre no la eliminó; prueba desde la web de ML' }
  await quitarDelCatalogo(db, c.item_id, vid)
  await db.query(
    `INSERT INTO ml_variantes_descartadas (codigo, cuenta, titulo, variante, motivo, por) VALUES ($1, $2, $3, $4, 'eliminada', $5)
     ON CONFLICT (empresa_id, codigo, motivo) DO NOTHING`, [codigo, c.nickname, c.titulo, c.variante, userId])
  await db.query(`DELETE FROM ml_variantes_descartadas WHERE codigo = $1 AND motivo = 'no_usa'`, [codigo])
  return { ok: true }
}

async function quitarDelCatalogo(db: Pool, itemId: string, vid: string) {
  await db.query(
    `UPDATE ml_catalogo SET variantes = (SELECT COALESCE(jsonb_agg(v), '[]'::jsonb) FROM jsonb_array_elements(variantes) v WHERE v->>'id' <> $2)
     WHERE item_id = $1`, [itemId, vid])
}
