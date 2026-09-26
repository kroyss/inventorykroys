import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized, forbidden } from '@/lib/session'

const Schema = z.object({
  full_name: z.string().trim().min(2).max(100).optional(),
  role:      z.enum(['admin', 'user']).optional(),
  is_active: z.boolean().optional(),
})

/**
 * PUT /api/users/[id] — nombre, rol, activo (admin).
 * Cambiar rol o desactivar cierra las sesiones abiertas de ese usuario (session_version).
 * Protecciones: no te puedes desactivar ni quitar el admin a ti mismo, y siempre queda
 * al menos un admin activo (si no, nadie podría volver a administrar).
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  if (session.user.role !== 'admin') return forbidden()

  try {
    const body = Schema.parse(await req.json())
    const { rows: [u] } = await db.query(
      `SELECT id, role, is_active FROM users WHERE id = $1 AND country_access = $2`, [id, session.user.country])
    if (!u) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })

    const esYo = u.id === parseInt(session.user.id, 10)
    const pierdeAdmin = u.role === 'admin' && u.is_active &&
      (body.role === 'user' || body.is_active === false)
    if (esYo && (body.is_active === false || body.role === 'user')) {
      return NextResponse.json({ error: 'No puedes desactivarte ni quitarte el rol de admin a ti mismo' }, { status: 400 })
    }
    if (pierdeAdmin) {
      const { rows: [{ n }] } = await db.query(
        `SELECT COUNT(*)::int AS n FROM users
         WHERE role = 'admin' AND is_active AND id <> $1 AND country_access = $2`, [u.id, session.user.country])
      if (n === 0) return NextResponse.json({ error: 'Tiene que quedar al menos un admin activo' }, { status: 400 })
    }

    const cambiaAcceso = (body.role !== undefined && body.role !== u.role) ||
                         (body.is_active !== undefined && body.is_active !== u.is_active)
    await db.query(
      `UPDATE users SET
         full_name = COALESCE($2, full_name),
         role      = COALESCE($3, role),
         is_active = COALESCE($4, is_active)
         ${cambiaAcceso ? ', session_version = session_version + 1' : ''}
       WHERE id = $1`,
      [u.id, body.full_name ?? null, body.role ?? null, body.is_active ?? null])
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message ?? err.message }, { status: 400 })
    return apiError(err)
  }
}
