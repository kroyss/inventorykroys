import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { apiError } from '@/lib/apiError'
import { dbGlobal } from '@/lib/db'
import { esDuenoPlataforma } from '@/lib/empresa'
import { MODULOS } from '@/lib/modulos'
import { forbidden, unauthorized } from '@/lib/session'

const modulosValidos = Object.keys(MODULOS) as [string, ...string[]]
const Schema = z.object({
  nombre:    z.string().trim().min(2).max(80).optional(),
  modulos:   z.array(z.enum(modulosValidos)).max(20).optional(),
  is_active: z.boolean().optional(),
  // Borradores de IA por mes (null = sin límite).
  ia_limite_mes: z.number().int().min(0).max(100000).nullable().optional(),
})

/**
 * PUT /api/plataforma/empresas/[id] — módulos, nombre, activa, límite de IA (solo el dueño de la
 * plataforma). Los cambios de módulos se aplican en el siguiente request de sus usuarios
 * (la sesión los relee); desactivar la empresa los saca en el siguiente request.
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  const session = await getServerSession(authOptions)
  if (!session?.user?.empresaId) return unauthorized()
  if (!esDuenoPlataforma(session.user)) return forbidden()

  try {
    const body = Schema.parse(await req.json())
    // No te puedes desactivar la empresa desde la que administras la plataforma.
    if (body.is_active === false && Number(id) === session.user.empresaId) {
      return NextResponse.json({ error: 'No puedes desactivar la empresa en la que estás' }, { status: 400 })
    }
    const { rowCount } = await dbGlobal().query(
      `UPDATE empresas SET
         nombre    = COALESCE($2, nombre),
         modulos   = COALESCE($3, modulos),
         is_active = COALESCE($4, is_active),
         ia_limite_mes = CASE WHEN $5 THEN $6::int ELSE ia_limite_mes END
       WHERE id = $1`,
      [id, body.nombre ?? null, body.modulos ?? null, body.is_active ?? null,
       body.ia_limite_mes !== undefined, body.ia_limite_mes ?? null])
    if (!rowCount) return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message ?? err.message }, { status: 400 })
    if ((err as { code?: string }).code === '23505') return NextResponse.json({ error: 'Ya existe una empresa con ese nombre' }, { status: 400 })
    return apiError(err)
  }
}
