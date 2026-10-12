import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized, forbidden } from '@/lib/session'
import { puede } from '@/lib/permisos'

/** POST /api/inventory/[productId]/verificar — "el stock está bien": quita la marca "stock por verificar"
 *  de un producto importado desde MercadoLibre (lib/importarML.ts) sin mover el stock. Si el número no
 *  estaba bien, se corrige con un ajuste (que también quita la marca). */
export async function POST(_: NextRequest, { params }: { params: Promise<{ productId: string }> }) {
  const { productId } = await params
  if (!/^\d+$/.test(productId)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  if (!puede(session.user, 'ver_inventario')) return forbidden()
  try {
    await db.query(`UPDATE products SET stock_por_verificar = FALSE WHERE id = $1`, [productId])
    return NextResponse.json({ ok: true })
  } catch (err) {
    return apiError(err)
  }
}
