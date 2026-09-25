import { NextRequest, NextResponse } from 'next/server'
import { getSessionDb, unauthorized, forbidden } from '@/lib/session'

// POST /api/invoices/[id]/printed → cuenta cada vez que se abre el diálogo de impresión.
// Sirve de rastro: una factura con 3 impresiones probablemente se reimprimió por un error.
export async function POST(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  if (session.user.country !== 'VE') return forbidden()

  await db.query(
    `UPDATE invoices SET print_count = print_count + 1, last_printed_at = NOW() WHERE id = $1`, [id]
  )
  return NextResponse.json({ ok: true })
}
