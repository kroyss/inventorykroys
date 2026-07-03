import { NextRequest, NextResponse } from 'next/server'
import { getSessionDb, unauthorized } from '@/lib/session'

// Chequeo EN VIVO de duplicados de Número de orden ML (mientras se escribe en el form).
// Accesible a cualquier rol — el campo lo usan admin y usuario normal al crear ventas.
export async function GET(req: NextRequest) {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()

  const url    = new URL(req.url)
  const number = (url.searchParams.get('number') ?? '').trim()
  const exclude = url.searchParams.get('exclude') // id de la venta en edición (no choca consigo misma)

  if (!number) return NextResponse.json({ exists: false })

  const params: unknown[] = [number]
  let excludeClause = ''
  if (exclude && /^\d+$/.test(exclude)) {
    params.push(exclude)
    excludeClause = `AND id != $${params.length}`
  }

  const { rows: [sale] } = await db.query(
    `SELECT id, status, customer_name FROM sales WHERE ml_order_number = $1 ${excludeClause} LIMIT 1`,
    params
  )

  if (!sale) return NextResponse.json({ exists: false })
  return NextResponse.json({
    exists: true,
    sale: { id: sale.id, status: sale.status, customer_name: sale.customer_name },
  })
}
