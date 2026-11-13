import { NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized } from '@/lib/session'
import { fotosProductos } from '@/lib/fotosProductos'

// GET /api/products/fotos (13-11-2026, mig. 173) → { product_id: url }: la foto de cada producto para las miniaturas de
// todo el sistema (lib/fotosProductos.ts, una sola regla). Cualquiera de la empresa: las fotos no son datos sensibles.
export async function GET() {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  try {
    return NextResponse.json(await fotosProductos(db), { headers: { 'Cache-Control': 'private, max-age=60' } })
  } catch (err) {
    return apiError(err)
  }
}
