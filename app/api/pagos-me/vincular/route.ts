import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { conectarVenta, sesionPagosME } from '@/lib/pagosME'

/** POST /api/pagos-me/vincular { venta } → al guardar la venta: pago verificado (si es válido) y guía a Despachos. */
export async function POST(req: NextRequest) {
  const s = await sesionPagosME()
  if ('error' in s) return s.error
  try {
    const { venta } = z.object({ venta: z.string().regex(/^\d{6,20}$/) }).parse(await req.json())
    return NextResponse.json(await conectarVenta(s.db, venta, s.userId))
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: 'Venta inválida' }, { status: 400 })
    return apiError(err)
  }
}
