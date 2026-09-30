import { NextRequest, NextResponse } from 'next/server'
import { hash } from 'bcryptjs'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { getSessionDb, unauthorized, forbidden } from '@/lib/session'

import { PASSWORD_MAX, PASSWORD_MIN, USERNAME_RE } from '@/lib/usuarios'

// Usuarios de la EMPRESA de la sesión (usuario_empresas). `users` es global y sin RLS:
// todo acceso se acota por usuario_empresas.empresa_id. Solo admin. Contraseñas: bcrypt.
const CreateSchema = z.object({
  username:  z.string().trim().toLowerCase().regex(USERNAME_RE, 'Usuario: 3 a 30 caracteres, solo letras, números, punto, guion o guion bajo'),
  full_name: z.string().trim().min(2, 'Falta el nombre').max(100),
  role:      z.enum(['admin', 'user']),
  password:  z.string().min(PASSWORD_MIN, `La contraseña debe tener al menos ${PASSWORD_MIN} caracteres`).max(PASSWORD_MAX),
})

/** GET /api/users — lista de usuarios (admin) */
export async function GET() {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  if (session.user.role !== 'admin') return forbidden()
  try {
    const { rows } = await db.query(
      `SELECT u.id, u.username, u.full_name, ue.role, u.is_active, u.created_at, u.last_login
       FROM users u JOIN usuario_empresas ue ON ue.user_id = u.id AND ue.empresa_id = $1
       ORDER BY u.is_active DESC, ue.role, u.username`, [session.user.empresaId])
    return NextResponse.json({ users: rows, me: parseInt(session.user.id, 10) })
  } catch (err) {
    return apiError(err)
  }
}

/** POST /api/users — crear usuario (admin) */
export async function POST(req: NextRequest) {
  const { session, db } = await getSessionDb()
  if (!session || !db) return unauthorized()
  if (session.user.role !== 'admin') return forbidden()
  try {
    const body = CreateSchema.parse(await req.json())
    // El nombre de usuario es único en TODO el sistema (todas las empresas): si ya existe,
    // no se reutiliza (sería darle acceso a esta empresa a la cuenta de otra persona).
    const { rows: [dup] } = await db.query(`SELECT 1 FROM users WHERE username = $1`, [body.username])
    if (dup) return NextResponse.json({ error: `El usuario "${body.username}" ya existe. Elige otro nombre.` }, { status: 400 })

    await db.query('BEGIN')
    const { rows: [u] } = await db.query(
      `INSERT INTO users (username, password_hash, full_name, role, country_access, is_active)
       VALUES ($1, $2, $3, $4, $5, TRUE) RETURNING id`,
      [body.username, await hash(body.password, 10), body.full_name, body.role, session.user.country])
    await db.query(
      `INSERT INTO usuario_empresas (user_id, empresa_id, role) VALUES ($1, $2, $3)`,
      [u.id, session.user.empresaId, body.role])
    await db.query('COMMIT')
    return NextResponse.json({ id: u.id }, { status: 201 })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message ?? err.message }, { status: 400 })
    return apiError(err)
  }
}
