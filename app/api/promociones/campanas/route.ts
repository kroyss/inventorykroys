import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { borrarCampana, crearCampana, editarCampana, MAX_DIAS_CAMPANA } from '@/lib/promocionesML'
import { sesionPromociones } from '@/lib/promocionesSesion'

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const dias = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5) + 1
const Nueva = z.object({
  conexionIds: z.array(z.number().int().positive()).min(1, 'Elige al menos una cuenta').max(10),
  nombre: z.string().trim().min(3).max(60),
  desde: fecha, hasta: fecha,
}).refine(b => b.hasta >= b.desde, 'La fecha de fin no puede ser antes del inicio')
  .refine(b => dias(b.desde, b.hasta) <= MAX_DIAS_CAMPANA, `La campaña puede durar como máximo ${MAX_DIAS_CAMPANA} días`)

/** POST /api/promociones/campanas → crea la misma campaña propia (SELLER_CAMPAIGN, % flexible) en cada cuenta elegida. */
export async function POST(req: NextRequest) {
  const s = await sesionPromociones()
  if ('error' in s) return s.error
  try {
    const b = Nueva.parse(await req.json())
    const { rows: cuentas } = await s.db.query(`SELECT id, nickname FROM ml_conexiones WHERE id = ANY($1::int[]) AND estado = 'activa'`, [b.conexionIds])
    const resultados: { cuenta: string; ok: boolean; error?: string }[] = []
    for (const c of cuentas) {
      const r = await crearCampana(s.db, c.id, s.userId, b.nombre, b.desde, b.hasta)
      resultados.push(r.ok ? { cuenta: c.nickname, ok: true } : { cuenta: c.nickname, ok: false, error: r.error })
    }
    const ok = resultados.filter(r => r.ok).length
    return ok ? NextResponse.json({ ok: true, resultados })
      : NextResponse.json({ error: resultados.map(r => `${r.cuenta}: ${r.error}`).join(' · ') || 'Sin cuentas' }, { status: 502 })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message }, { status: 400 })
    return apiError(err)
  }
}

const Edicion = z.object({
  conexionId: z.number().int().positive(),
  id: z.string().regex(/^C-MLV\d+$/, 'Solo se editan campañas propias'),
  nombre: z.string().trim().min(3).max(60),
  desde: fecha.nullable(), hasta: fecha,
}).refine(b => !b.desde || b.hasta >= b.desde, 'La fecha de fin no puede ser antes del inicio')
  .refine(b => !b.desde || dias(b.desde, b.hasta) <= MAX_DIAS_CAMPANA, `La campaña puede durar como máximo ${MAX_DIAS_CAMPANA} días`)

/** PUT /api/promociones/campanas → cambia nombre y fechas de una campaña PROPIA (ya empezada: solo nombre y fin). */
export async function PUT(req: NextRequest) {
  const s = await sesionPromociones()
  if ('error' in s) return s.error
  try {
    const b = Edicion.parse(await req.json())
    const r = await editarCampana(s.db, b.conexionId, s.userId, b.id, b.nombre, b.desde, b.hasta)
    return r.ok ? NextResponse.json({ ok: true, ...r.datos }) : NextResponse.json({ error: r.error }, { status: 502 })
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
