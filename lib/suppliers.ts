// Resuelve el supplier_id a partir de un id explícito o de un nombre libre.
// Si llega solo el nombre (campo libre estilo legacy), busca un proveedor del
// mismo tipo con ese nombre y, si no existe, lo crea. Reactiva si estaba inactivo.
type DB = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> }

export async function resolveSupplierId(
  db: DB,
  opts: { supplierId?: number | null; supplierName?: string; type: 'local' | 'import' }
): Promise<number> {
  if (opts.supplierId) return opts.supplierId

  const name = (opts.supplierName ?? '').trim()
  if (!name) throw new Error('El proveedor es obligatorio')

  const typeFilter = opts.type === 'local'
    ? `(supplier_type = 'local' OR supplier_type IS NULL)`
    : `supplier_type = 'import'`

  const { rows: existing } = await db.query(
    `SELECT id, is_active FROM suppliers
     WHERE LOWER(name) = LOWER($1) AND ${typeFilter}
     ORDER BY is_active DESC LIMIT 1`,
    [name]
  )
  if (existing[0]) {
    if (!existing[0].is_active) {
      await db.query(`UPDATE suppliers SET is_active = TRUE WHERE id = $1`, [existing[0].id])
    }
    return existing[0].id
  }

  const { rows: [created] } = await db.query(
    `INSERT INTO suppliers (name, supplier_type, is_active) VALUES ($1, $2, TRUE) RETURNING id`,
    [name, opts.type]
  )
  return created.id
}
