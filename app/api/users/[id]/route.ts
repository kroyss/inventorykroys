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
 * El rol es el de ESTA empresa (usuario_empresas) y se aplica en el siguiente request.
 * Desactivar es global (la persona no entra a ninguna empresa) y cierra sus sesiones.
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
      `SELECT u.id, ue.role, u.is_active
       FROM users u JOIN usuario_empresas ue ON ue.user_id = u.id AND ue.empresa_id = $2
       WHERE u.id = $1`, [id, session.user.empresaId])
    if (!u) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })

    const esYo = u.id === parseInt(session.user.id, 10)
    const pierdeAdmin = u.role === 'admin' && u.is_active &&
      (body.role === 'user' || body.is_active === false)
    if (esYo && (body.is_active === false || body.role === 'user')) {
      return NextResponse.json({ error: 'No puedes desactivarte ni quitarte el rol de admin a ti mismo' }, { status: 400 })
    }
    if (pierdeAdmin) {
      const { rows: [{ n }] } = await db.query(
        `SELECT COUNT(*)::int AS n
         FROM users x JOIN usuario_empresas ue ON ue.user_id = x.id AND ue.empresa_id = $2
         WHERE ue.role = 'admin' AND x.is_active AND x.id <> $1`, [u.id, session.user.empresaId])
      if (n === 0) return NextResponse.json({ error: 'Tiene que quedar al menos un admin activo' }, { status: 400 })
    }

    const desactiva = body.is_active !== undefined && body.is_active !== u.is_active
    await db.query('BEGIN')
    await db.query(
      `UPDATE users SET
         full_name = COALESCE($2, full_name),
         is_active = COALESCE($3, is_active)
         ${desactiva ? ', session_version = session_version + 1' : ''}
       WHERE id = $1`,
      [u.id, body.full_name ?? null, body.is_active ?? null])
    if (body.role !== undefined) {
      await db.query(`UPDATE usuario_empresas SET role = $3 WHERE user_id = $1 AND empresa_id = $2`,
        [u.id, session.user.empresaId, body.role])
    }
    await db.query('COMMIT')
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message ?? err.message }, { status: 400 })
    return apiError(err)
  }
}
