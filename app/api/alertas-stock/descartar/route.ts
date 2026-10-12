import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { sesionStock } from '@/lib/preguntasSesion'

// POST /api/alertas-stock/descartar { item_id, variante_id, quitar } (2026-10-12, migración 087)
//   quitar: true  → "No hay, quitar": deja de avisar (va a "En el olvido") hasta que se reponga y vuelva a caer.
//   quitar: false → "Volver a avisar".
const Body = z.object({ item_id: z.string().regex(/^[A-Z]{3}\d+$/), variante_id: z.string().regex(/^\d+$/), quitar: z.boolean() })

export async function POST(req: NextRequest) {
  const s = await sesionStock()
  if ('error' in s) return s.error
  try {
    const { item_id, variante_id, quitar } = Body.parse(await req.json())
    await s.db.query(
      `UPDATE ml_stock_alertas SET descartada_at = CASE WHEN $3 THEN NOW() END WHERE item_id = $1 AND variante_id = $2::bigint`,
      [item_id, variante_id, quitar])
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: 'Publicación inválida' }, { status: 400 })
    return apiError(err)
  }
}
