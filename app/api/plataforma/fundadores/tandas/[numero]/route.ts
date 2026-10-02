import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { dbGlobal } from '@/lib/db'
import { soloDueno } from '@/lib/plataforma'

const Body = z.object({
  abierta: z.boolean().optional(),
  inicia: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida').nullable().optional(),
})

// PUT /api/plataforma/fundadores/tandas/[numero] { abierta?, inicia? } → abrir/cerrar una tanda o cambiar su fecha de inicio.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ numero: string }> }) {
  const { error } = await soloDueno()
  if (error) return error
  const { numero } = await params
  try {
    const b = Body.parse(await req.json())
    await dbGlobal().query(
      `UPDATE fundadores_tandas SET abierta = COALESCE($2, abierta),
              inicia = CASE WHEN $4 THEN $3::date ELSE inicia END
       WHERE numero = $1`, [Number(numero), b.abierta ?? null, b.inicia ?? null, b.inicia !== undefined])
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message }, { status: 400 })
    return apiError(err)
  }
}
