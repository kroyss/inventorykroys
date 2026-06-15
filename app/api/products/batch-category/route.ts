import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { z } from 'zod'
import { getSessionDb, unauthorized, forbidden } from '@/lib/session'

const Schema = z.object({
  product_ids:       z.array(z.number().int().positive()),
  profit_category_id: z.number().int().positive(),
})

export async function PUT(req: NextRequest) {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  if (session.user.role !== 'admin') return forbidden()

  try {
    const body = Schema.parse(await req.json())
    await db.query(
      `UPDATE product_pricing
       SET profit_category_id = $1
       WHERE product_id = ANY($2::int[])`,
      [body.profit_category_id, body.product_ids]
    )
    return NextResponse.json({ updated: body.product_ids.length })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.message }, { status: 400 })
    return apiError(err)
  }
}
