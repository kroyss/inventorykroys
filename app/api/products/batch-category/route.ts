import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { z } from 'zod'
import { getSessionDb, unauthorized, forbidden } from '@/lib/session'
import { puede } from '@/lib/permisos'

const Schema = z.object({
  product_ids:       z.array(z.number().int().positive()),
  profit_category_id: z.number().int().positive().optional(),
  ganancia_pct:       z.number().min(0).max(200).optional(),   // 14-11 (mig. 179): % de ganancia (CO / sin tasa)
}).refine(b => b.profit_category_id != null || b.ganancia_pct != null, 'Falta el % de ganancia')

export async function PUT(req: NextRequest) {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  if (!puede(session.user, 'ver_productos')) return forbidden()

  try {
    const body = Schema.parse(await req.json())
    await db.query(
      `UPDATE product_pricing
       SET profit_category_id = COALESCE($1, profit_category_id),
           ganancia_pct = COALESCE($3::numeric, (SELECT profit_percentage FROM profit_categories WHERE id = $1), ganancia_pct)
       WHERE product_id = ANY($2::int[])`,
      [body.profit_category_id ?? null, body.product_ids, body.ganancia_pct ?? null]
    )
    return NextResponse.json({ updated: body.product_ids.length })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.message }, { status: 400 })
    return apiError(err)
  }
}
