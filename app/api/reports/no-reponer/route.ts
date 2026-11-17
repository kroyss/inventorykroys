import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized, forbidden } from '@/lib/session'
import { puede } from '@/lib/permisos'
import { antesDeMarcar, devolverNoReponer, marcarNoReponer } from '@/lib/noReponer'

// Reportes → Stock → Reponer · «No volver a pedir» (17-11, mig 184, lib/noReponer.ts). Permiso ver_productos (el mismo de
// «Desactivar» en Productos).
//   GET ?ids=1,2 → para la confirmación: publicaciones activas en ML de cada uno y los que tienen ventas sin registrar
//   POST { ids, deshacer? } → marcar (y desactivar los que se puede) · deshacer = «Devolver»
const Ids = z.array(z.number().int().positive()).min(1).max(500)

export async function GET(req: NextRequest) {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  if (!puede(session.user, 'ver_reportes') || !puede(session.user, 'ver_productos')) return forbidden()
  try {
    const ids = Ids.parse((req.nextUrl.searchParams.get('ids') ?? '').split(',').filter(Boolean).map(Number))
    return NextResponse.json(await antesDeMarcar(db, ids))
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.message }, { status: 400 })
    return apiError(err)
  }
}

export async function POST(req: NextRequest) {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  if (!puede(session.user, 'ver_reportes') || !puede(session.user, 'ver_productos')) return forbidden()
  try {
    const b = z.object({ ids: Ids, deshacer: z.boolean().optional() }).parse(await req.json())
    if (b.deshacer) return NextResponse.json({ ok: true, devueltos: await devolverNoReponer(db, b.ids) })
    return NextResponse.json({ ok: true, ...await marcarNoReponer(db, b.ids, parseInt(session.user.id, 10)) })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.message }, { status: 400 })
    return apiError(err)
  }
}
