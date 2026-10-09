import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { autenticarVigilante } from '@/lib/pagosME'

const Body = z.object({
  pedido: z.number().int().positive(),
  ok: z.boolean(),
  cuenta: z.string().trim().max(80).nullish(),
  vistas: z.number().int().min(0).default(0),     // órdenes pagadas de los últimos 7 días en el portal
  nuevas: z.number().int().min(0).default(0),     // subidas en esta pasada
  error: z.string().trim().max(300).nullish(),     // p. ej. "sin_sesion" = hay que iniciar sesión en ese perfil
})

/** POST /api/pagos-me/vigilante/fin → el perfil anota su resultado en el pedido. */
export async function POST(req: NextRequest) {
  const a = await autenticarVigilante(req)
  if ('error' in a) return a.error
  try {
    const b = Body.parse(await req.json())
    await a.db.query(
      `UPDATE me_pedidos SET resultados = resultados || jsonb_build_object($2::text,
         jsonb_build_object('ok', $3::boolean, 'cuenta', $4::text, 'vistas', $5::int, 'nuevas', $6::int,
                            'error', $7::text, 'at', NOW()))
       WHERE id = $1`,
      [b.pedido, a.perfil, b.ok, b.cuenta ?? null, b.vistas, b.nuevas, b.error ?? null])
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message }, { status: 400 })
    return apiError(err)
  }
}
