import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { getFinanceSession } from '@/lib/finance'
import { unauthorized, forbidden } from '@/lib/session'

// Quitar una categoría. Si tiene movimientos asociados se desactiva (para no
// romper el histórico); si no, se borra de verdad.
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { session, db } = await getFinanceSession()
  if (!session || !db) return unauthorized()
  if (session.user.role !== 'admin') return forbidden()

  try {
    const { rows: [u] } = await db.query(
      `SELECT COUNT(*)::int AS n FROM finance_movements WHERE category_id = $1`, [id]
    )
    if (u.n > 0) {
      await db.query(`UPDATE finance_categories SET is_active = FALSE WHERE id = $1`, [id])
      return NextResponse.json({ ok: true, deactivated: true })
    }
    await db.query(`DELETE FROM finance_categories WHERE id = $1`, [id])
    return NextResponse.json({ ok: true })
  } catch (err) {
    return apiError(err)
  }
}
