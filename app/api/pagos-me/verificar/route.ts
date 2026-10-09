import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { conectarVenta, sesionPagosME } from '@/lib/pagosME'

const Body = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(300),
  verificacion: z.enum(['pendiente', 'valido', 'invalido']),
  nota: z.string().trim().max(300).optional(),
})

/** PUT /api/pagos-me/verificar → marca un lote de pagos (válido / inválido / volver a pendiente). */
export async function PUT(req: NextRequest) {
  const s = await sesionPagosME()
  if ('error' in s) return s.error
  try {
    const b = Body.parse(await req.json())
    const { rows } = await s.db.query(
      `UPDATE me_pagos SET verificacion = $2,
              verificado_por = CASE WHEN $2 = 'pendiente' THEN NULL ELSE $3::int END,
              verificado_at  = CASE WHEN $2 = 'pendiente' THEN NULL ELSE NOW() END,
              nota = COALESCE($4, nota), actualizado_at = NOW()
       WHERE id = ANY($1::bigint[]) RETURNING venta`,
      [b.ids, b.verificacion, s.userId, b.nota ?? null])
    // Las ventas ya registradas pasan a PAGO_VERIFICADO (si estaban en BORRADOR).
    let verificadas = 0
    if (b.verificacion === 'valido') {
      for (const r of rows) {
        const c = await conectarVenta(s.db, r.venta, s.userId)
        if ('verificada' in c && c.verificada) verificadas++
      }
    }
    return NextResponse.json({ ok: true, marcados: rows.length, ventas_verificadas: verificadas })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message }, { status: 400 })
    return apiError(err)
  }
}
