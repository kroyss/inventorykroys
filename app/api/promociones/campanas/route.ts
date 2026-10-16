import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { borrarCampana, crearCampana } from '@/lib/promocionesML'
import { sesionPromociones } from '@/lib/promocionesSesion'

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const Nueva = z.object({
  conexionId: z.number().int().positive(),
  nombre: z.string().trim().min(3).max(60),
  desde: fecha, hasta: fecha,
}).refine(b => b.hasta >= b.desde, 'La fecha de fin no puede ser antes del inicio')

/** POST /api/promociones/campanas → crea una campaña propia en ML (SELLER_CAMPAIGN, % flexible). */
export async function POST(req: NextRequest) {
  const s = await sesionPromociones()
  if ('error' in s) return s.error
  try {
    const b = Nueva.parse(await req.json())
    const r = await crearCampana(s.db, b.conexionId, s.userId, b.nombre, b.desde, b.hasta)
    return r.ok ? NextResponse.json({ ok: true, campana: r.datos }) : NextResponse.json({ error: r.error }, { status: 502 })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message }, { status: 400 })
    return apiError(err)
  }
}

/** DELETE /api/promociones/campanas?conexion=1&id=C-MLV…&nombre=… → borra una campaña PROPIA en ML. */
export async function DELETE(req: NextRequest) {
  const s = await sesionPromociones()
  if ('error' in s) return s.error
  try {
    const q = req.nextUrl.searchParams
    const conexion = z.coerce.number().int().positive().parse(q.get('conexion'))
    const id = z.string().regex(/^C-MLV\d+$/, 'Solo se borran campañas propias').parse(q.get('id'))
    const r = await borrarCampana(s.db, conexion, s.userId, id, q.get('nombre'))
    return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: 502 })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message }, { status: 400 })
    return apiError(err)
  }
}
