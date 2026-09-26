import { NextRequest, NextResponse } from 'next/server'
import { hash } from 'bcryptjs'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized, forbidden } from '@/lib/session'
import { PASSWORD_MAX, PASSWORD_MIN } from '@/lib/usuarios'

const Schema = z.object({
  password: z.string().min(PASSWORD_MIN, `La contraseña debe tener al menos ${PASSWORD_MIN} caracteres`).max(PASSWORD_MAX),
})

/** PUT /api/users/[id]/password — nueva contraseña (admin). Cierra las sesiones abiertas
 *  de ese usuario: tendrá que entrar con la contraseña nueva. */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  if (session.user.role !== 'admin') return forbidden()

  try {
    const { password } = Schema.parse(await req.json())
    const { rowCount } = await db.query(
      `UPDATE users SET password_hash = $2, session_version = session_version + 1
       WHERE id = $1 AND country_access = $3`,
      [id, await hash(password, 10), session.user.country])
    if (!rowCount) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })
    return NextResponse.json({ ok: true, yo: parseInt(id, 10) === parseInt(session.user.id, 10) })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message ?? err.message }, { status: 400 })
    return apiError(err)
  }
}
