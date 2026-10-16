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
  unidades: z.number().int().min(1).max(500).nullish(),     // combos (migración 098): sin dato no se cambia
  titulo: z.string().max(300).nullish(),
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
    if (ya) {
      await s.db.query(`UPDATE product_ml_codes SET is_active = TRUE, unidades = COALESCE($2, unidades), titulo = COALESCE($3, titulo),
                          combo_revisado = combo_revisado OR $2::int IS NOT NULL, updated_at = NOW() WHERE id = $1`,
        [ya.id, b.unidades ?? null, b.titulo ?? null])
    } else {
      await s.db.query(`INSERT INTO product_ml_codes (product_id, ml_account, ml_code, is_active, unidades, titulo, combo_revisado)
                        VALUES ($1, $2, $3, TRUE, COALESCE($4::int, 1), $5, $4::int IS NOT NULL)`,
        [b.product_id, b.cuenta, codigo, b.unidades ?? null, b.titulo ?? null])
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message }, { status: 400 })
    return apiError(err)
  }
}
