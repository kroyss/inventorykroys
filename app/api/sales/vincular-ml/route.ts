import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { sesionPreguntas } from '@/lib/preguntasSesion'

// POST /api/sales/vincular-ml { product_id, cuenta, item_id } (2026-10-12): desde Nueva venta, "esta
// publicación siempre es este producto": agrega el código ML al producto (solo agrega, no borra
// nada). Así la próxima venta de esa publicación llega con el producto puesto.
const Schema = z.object({
  product_id: z.number().int().positive(),
  cuenta: z.string().min(1).max(50),
  item_id: z.string().regex(/^[A-Z]{3}\d+$/),
})

export async function POST(req: NextRequest) {
  const s = await sesionPreguntas()
  if ('error' in s) return s.error
  try {
    const b = Schema.parse(await req.json())
    const codigo = b.item_id.replace(/^[A-Z]{3}/, '')
    const { rows: [p] } = await s.db.query(`SELECT id FROM products WHERE id = $1 AND is_active`, [b.product_id])
    if (!p) return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 })
    const { rows: [ya] } = await s.db.query(
      `SELECT id, is_active FROM product_ml_codes WHERE product_id = $1 AND ml_code = $2 ORDER BY is_active DESC LIMIT 1`,
      [b.product_id, codigo])
    if (ya && !ya.is_active) await s.db.query(`UPDATE product_ml_codes SET is_active = TRUE WHERE id = $1`, [ya.id])
    if (!ya) {
      await s.db.query(`INSERT INTO product_ml_codes (product_id, ml_account, ml_code, is_active) VALUES ($1, $2, $3, TRUE)`,
        [b.product_id, b.cuenta, codigo])
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message }, { status: 400 })
    return apiError(err)
  }
}
