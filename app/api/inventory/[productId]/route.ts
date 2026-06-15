import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { z } from 'zod'
import { getSessionDb, unauthorized } from '@/lib/session'

const Schema = z.object({
  min_stock:  z.number().int().min(0),
  max_stock:  z.number().int().min(0),
  sale_price: z.number().nonnegative(),
})

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ productId: string }> }
) {
  const { productId } = await params
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()

  try {
    const body = Schema.parse(await req.json())
    const { rowCount } = await db.query(
      `UPDATE inventory
       SET min_stock = $1, max_stock = $2, sale_price = $3, last_updated = NOW()
       WHERE product_id = $4`,
      [body.min_stock, body.max_stock, body.sale_price, productId]
    )
    if (!rowCount) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.message }, { status: 400 })
    return apiError(err)
  }
}
