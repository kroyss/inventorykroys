import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { agregarACampana, quitarDeCampana } from '@/lib/promocionesML'
import { sesionPromociones } from '@/lib/promocionesSesion'

export const maxDuration = 120

const Campana = z.object({ id: z.string().min(3).max(40), tipo: z.string().min(3).max(40), nombre: z.string().max(120).nullable() })
const Body = z.discriminatedUnion('accion', [
  z.object({
    accion: z.literal('agregar'), conexionId: z.number().int().positive(), campana: Campana,
    items: z.array(z.object({ id: z.string().regex(/^MLV\d+$/), precio: z.number().positive(), precioAntes: z.number().positive() })).min(1).max(100),
  }),
  z.object({
    accion: z.literal('quitar'), conexionId: z.number().int().positive(), campana: Campana,
    items: z.array(z.object({ id: z.string().regex(/^MLV\d+$/) })).min(1).max(100),
  }),
])

/**
 * POST /api/promociones/acciones → agregar publicaciones a una campaña (de ML o propia) a un precio, o
 * sacarlas. De a una (ML no tiene "en lote"); cada una queda registrada con su resultado.
 */
export async function POST(req: NextRequest) {
  const s = await sesionPromociones()
  if ('error' in s) return s.error
  try {
    const b = Body.parse(await req.json())
    const resultados: { id: string; ok: boolean; error?: string }[] = []
    for (const it of b.items) {
      const r = b.accion === 'agregar'
        ? await agregarACampana(s.db, b.conexionId, s.userId, it as { id: string; precio: number; precioAntes: number }, b.campana)
        : await quitarDeCampana(s.db, b.conexionId, s.userId, it.id, b.campana)
      resultados.push(r.ok ? { id: it.id, ok: true } : { id: it.id, ok: false, error: r.error })
    }
    return NextResponse.json({ resultados, ok: resultados.filter(r => r.ok).length, error: resultados.filter(r => !r.ok).length })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message }, { status: 400 })
    return apiError(err)
  }
}
