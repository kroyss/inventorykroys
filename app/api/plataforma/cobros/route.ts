import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { soloDueno } from '@/lib/plataforma'
import { guardarDatosCobro, panelCobros } from '@/lib/cobros'

// Plataforma → Cobros (02-11-2026, migración 141).
//   GET → pagos por revisar, cuentas que vencen en 7 días, lo último revisado y los datos de cobro
//   PUT { pago_movil, binance } → cambia los datos de cobro que ve el cliente en Mi plan
export async function GET() {
  const { error } = await soloDueno()
  if (error) return error
  try {
    return NextResponse.json(await panelCobros(), { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    return apiError(err)
  }
}

const T = z.string().trim().min(1, 'Completa todos los datos de cobro').max(100)
const Datos = z.object({
  pago_movil: z.object({ banco: T, cedula: T, telefono: T }),
  binance: z.object({ id: T, nombre: T, correo: T, moneda: T }),
})

export async function PUT(req: NextRequest) {
  const { error } = await soloDueno()
  if (error) return error
  try {
    await guardarDatosCobro(Datos.parse(await req.json()))
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message ?? err.message }, { status: 400 })
    return apiError(err)
  }
}
