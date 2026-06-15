import { NextRequest, NextResponse } from 'next/server'
import { getSessionDb, unauthorized, forbidden } from '@/lib/session'

export async function DELETE(
  _: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  if (session.user.role !== 'admin') return forbidden()

  // Bloquear si tiene CUALQUIER orden registrada (compra local o importación, cualquier estado)
  const [{ rows: po }, { rows: io }] = await Promise.all([
    db.query(`SELECT COUNT(*)::int AS n FROM purchase_orders WHERE supplier_id = $1`, [id]),
    db.query(`SELECT COUNT(*)::int AS n FROM import_orders   WHERE supplier_id = $1`, [id]),
  ])
  const total = (po[0]?.n ?? 0) + (io[0]?.n ?? 0)
  if (total > 0) {
    return NextResponse.json(
      { error: `No se puede eliminar: el proveedor tiene ${total} orden(es) registrada(s).` },
      { status: 409 }
    )
  }

  const { rowCount } = await db.query(
    `UPDATE suppliers SET is_active = FALSE WHERE id = $1`,
    [id]
  )
  if (!rowCount) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
