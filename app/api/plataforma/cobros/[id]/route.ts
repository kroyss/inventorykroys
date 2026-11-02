import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { soloDueno } from '@/lib/plataforma'
import { ErrorCobro, aprobarCobro, rechazarCobro } from '@/lib/cobros'

// POST /api/plataforma/cobros/[id] { accion: 'aprobar' } | { accion: 'rechazar', motivo }
// Aprobar = activar o renovar el plan como en Plan y pagos (lib/cobros.ts registrarPlan); el cliente lo ve en Mi plan
// y, si conectó Telegram, le llega el aviso. Rechazar: el motivo lo ve el cliente y puede volver a reportar.
const Body = z.discriminatedUnion('accion', [
  z.object({ accion: z.literal('aprobar') }),
  z.object({ accion: z.literal('rechazar'), motivo: z.string().trim().min(3, 'Escribe el motivo (lo ve el cliente)').max(300) }),
])

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error, session } = await soloDueno()
  if (error) return error
  const { id } = await params
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  try {
    const b = Body.parse(await req.json())
    const por = Number(session!.user.id)
    if (b.accion === 'aprobar') {
      const r = await aprobarCobro(Number(id), por)
      return NextResponse.json({ ok: true, mensaje: `Aprobado: plan activo hasta el ${r.hasta.split('-').reverse().join('/')}.` })
    }
    await rechazarCobro(Number(id), b.motivo, por)
    return NextResponse.json({ ok: true, mensaje: 'Rechazado: el cliente ve el motivo y puede volver a reportar.' })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message ?? err.message }, { status: 400 })
    if (err instanceof ErrorCobro) return NextResponse.json({ error: err.message }, { status: 400 })
    return apiError(err)
  }
}
