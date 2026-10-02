import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { dbGlobal } from '@/lib/db'
import { soloDueno } from '@/lib/plataforma'

const Body = z.object({
  abierta: z.boolean().optional(),
  inscribe_desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida').nullable().optional(),
  inscribe_hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida').nullable().optional(),
})

// PUT /api/plataforma/fundadores/tandas/[numero] { abierta?, inscribe_desde?, inscribe_hasta? } → abrir/cerrar una
// tanda o cambiar sus días de inscripción.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ numero: string }> }) {
  const { error } = await soloDueno()
  if (error) return error
  const { numero } = await params
  try {
    const b = Body.parse(await req.json())
    await dbGlobal().query(
      `UPDATE fundadores_tandas SET abierta = COALESCE($2, abierta),
              inscribe_desde = CASE WHEN $4 THEN $3::date ELSE inscribe_desde END,
              inscribe_hasta = CASE WHEN $6 THEN $5::date ELSE inscribe_hasta END
       WHERE numero = $1`,
      [Number(numero), b.abierta ?? null, b.inscribe_desde ?? null, b.inscribe_desde !== undefined,
       b.inscribe_hasta ?? null, b.inscribe_hasta !== undefined])
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message }, { status: 400 })
    return apiError(err)
  }
}
