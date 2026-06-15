import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { z } from 'zod'
import { getSessionDb, unauthorized, forbidden } from '@/lib/session'

const Schema = z.object({
  action: z.enum(['activate', 'deactivate', 'delete']),
})

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  if (session.user.role !== 'admin') return forbidden()

  try {
    const { action } = Schema.parse(await req.json())

    if (action === 'delete') {
      // Match legacy: block only if product has sales records
      const { rowCount } = await db.query(
        `SELECT 1 FROM sale_items WHERE product_id = $1 LIMIT 1`, [id]
      )
      if (rowCount && rowCount > 0) {
        return NextResponse.json(
          { error: 'No se puede eliminar: el producto tiene ventas registradas' },
          { status: 409 }
        )
      }
      await db.query('BEGIN')
      try {
        await db.query('DELETE FROM inventory_movements  WHERE product_id = $1', [id])
        await db.query('DELETE FROM purchase_order_items WHERE product_id = $1', [id])
        await db.query('DELETE FROM import_order_items   WHERE product_id = $1', [id])
        await db.query('DELETE FROM product_ml_codes     WHERE product_id = $1', [id])
        await db.query('DELETE FROM inventory            WHERE product_id = $1', [id])
        await db.query('DELETE FROM product_pricing      WHERE product_id = $1', [id])
        await db.query('DELETE FROM products             WHERE id = $1',         [id])
        await db.query('COMMIT')
      } catch (e) {
        await db.query('ROLLBACK')
        throw e
      }
      return NextResponse.json({ ok: true })
    }

    const isActive = action === 'activate'
    const { rowCount } = await db.query(
      `UPDATE products SET is_active = $1 WHERE id = $2`,
      [isActive, id]
    )
    if (!rowCount) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.message }, { status: 400 })
    return apiError(err)
  }
}
