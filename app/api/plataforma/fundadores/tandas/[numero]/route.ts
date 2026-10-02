import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { dbGlobal } from '@/lib/db'
import { soloDueno } from '@/lib/plataforma'

const Body = z.object({ abierta: z.boolean().optional(), abre_texto: z.string().trim().max(60).nullable().optional() })

// PUT /api/plataforma/fundadores/tandas/[numero] { abierta?, abre_texto? } → abrir/cerrar una tanda.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ numero: string }> }) {
  const { error } = await soloDueno()
  if (error) return error
  const { numero } = await params
  try {
    const b = Body.parse(await req.json())
    await dbGlobal().query(
      `UPDATE fundadores_tandas SET abierta = COALESCE($2, abierta),
              abre_texto = CASE WHEN $4 THEN $3 ELSE abre_texto END
       WHERE numero = $1`, [Number(numero), b.abierta ?? null, b.abre_texto ?? null, b.abre_texto !== undefined])
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message }, { status: 400 })
    return apiError(err)
  }
}
