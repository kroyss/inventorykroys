import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized, forbidden } from '@/lib/session'
import { gruposDe, type Grupo } from '@/lib/actualizarGrupos'
import { estadoCentral, ejecutarGrupo } from '@/lib/actualizarCentral'
import { tieneModulo } from '@/lib/modulos'

// Central de actualización (18-11, botón de arriba junto a Novedades; lib/actualizarGrupos.ts).
//   GET  → cuándo quedó al día cada grupo que esta persona puede actualizar
//   POST { grupo } → actualiza ese grupo (no relee lo que ya está al día)
export const maxDuration = 120

export async function GET() {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  try {
    return NextResponse.json({ grupos: await estadoCentral(db, gruposDe(session.user)) })
  } catch (err) { return apiError(err) }
}

const Body = z.object({ grupo: z.enum(['ventas', 'preguntas', 'publicaciones', 'promociones', 'pagosme']) })

export async function POST(req: NextRequest) {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  try {
    const p = Body.safeParse(await req.json().catch(() => null))
    if (!p.success) return NextResponse.json({ error: p.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
    const grupo = p.data.grupo as Grupo
    if (!gruposDe(session.user).includes(grupo)) return forbidden()
    const r = await ejecutarGrupo(db, grupo, {
      userId: Number(session.user.id),
      // Pagos ME con Inventario: la misma traída trae también los pesos del portal (antes «Traer pesos de ML» aparte).
      pesos: tieneModulo(session.user, 'inventario'),
    })
    return NextResponse.json(r)
  } catch (err) { return apiError(err) }
}
