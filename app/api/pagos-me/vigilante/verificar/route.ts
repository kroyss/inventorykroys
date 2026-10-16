import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { autenticarVigilante, verificarCuenta } from '@/lib/pagosME'

const Body = z.object({
  cuenta: z.string().trim().max(80).nullish(),
  ventas: z.array(z.string().max(20)).max(1000),
})

/** POST /api/pagos-me/vigilante/verificar → ¿la cuenta de MercadoEnvíos abierta en este Chrome es de una
 *  cuenta de ML conectada? La extensión lo pregunta al conectar y al abrir su ventana (migración 096). */
export async function POST(req: NextRequest) {
  const a = await autenticarVigilante(req)
  if ('error' in a) return a.error
  try {
    const b = Body.parse(await req.json())
    return NextResponse.json(await verificarCuenta(a.db, a.perfil, b.cuenta ?? null, b.ventas))
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message }, { status: 400 })
    return apiError(err)
  }
}
