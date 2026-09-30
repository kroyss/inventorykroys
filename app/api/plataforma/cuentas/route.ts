import { NextRequest, NextResponse } from 'next/server'
import { hash } from 'bcryptjs'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { dbGlobal } from '@/lib/db'
import { PRODUCTOS } from '@/lib/productos'
import { soloDueno } from '@/lib/plataforma'
import { PASSWORD_MAX, PASSWORD_MIN, USERNAME_RE } from '@/lib/usuarios'

// Plataforma → Cuentas: las personas (cuenta única para todos los productos). Solo el
// dueño de la plataforma. Qué empresas de inventario tiene cada una se ve aquí y se
// administra en Usuarios de cada empresa.
/** GET /api/plataforma/cuentas */
export async function GET() {
  const { error } = await soloDueno()
  if (error) return error
  try {
    const { rows } = await dbGlobal().query(
      `SELECT u.id, u.username, u.email, u.full_name, u.is_active, u.productos, u.last_login,
              COALESCE((SELECT json_agg(json_build_object('nombre', e.nombre, 'role', ue.role) ORDER BY e.id)
                          FROM usuario_empresas ue JOIN empresas e ON e.id = ue.empresa_id
                         WHERE ue.user_id = u.id), '[]'::json) AS empresas
       FROM users u
       ORDER BY u.is_active DESC, u.username`)
    return NextResponse.json({ cuentas: rows, productos: PRODUCTOS })
  } catch (err) {
    return apiError(err)
  }
}

const productosValidos = Object.keys(PRODUCTOS) as [string, ...string[]]
const CreateSchema = z.object({
  username:  z.string().trim().toLowerCase().regex(USERNAME_RE, 'Usuario: 3 a 30 caracteres, solo letras, números, punto, guion o guion bajo'),
  email:     z.string().trim().toLowerCase().email('Correo inválido').max(120).or(z.literal('')),
  full_name: z.string().trim().min(2, 'Falta el nombre').max(100),
  password:  z.string().min(PASSWORD_MIN, `La contraseña debe tener al menos ${PASSWORD_MIN} caracteres`).max(PASSWORD_MAX),
  productos: z.array(z.enum(productosValidos)).min(1, 'Marca al menos un producto'),
})

/** POST /api/plataforma/cuentas — cuenta sin empresa de inventario (p.ej. solo Radar).
 *  Para inventario se crea desde Plataforma → Nueva empresa o desde Usuarios de la empresa. */
export async function POST(req: NextRequest) {
  const { error } = await soloDueno()
  if (error) return error
  try {
    const body = CreateSchema.parse(await req.json())
    const db = dbGlobal()
    const { rows: [dup] } = await db.query(
      `SELECT username FROM users WHERE username = $1 OR ($2 <> '' AND lower(email) = $2)`, [body.username, body.email])
    if (dup) return NextResponse.json({ error: dup.username === body.username ? `El usuario "${body.username}" ya existe` : 'Ese correo ya está en otra cuenta' }, { status: 400 })
    const { rows: [u] } = await db.query(
      `INSERT INTO users (username, email, password_hash, full_name, role, country_access, is_active, productos)
       VALUES ($1, NULLIF($2, ''), $3, $4, 'user', 'VE', TRUE, $5) RETURNING id`,
      [body.username, body.email, await hash(body.password, 10), body.full_name, body.productos])
    return NextResponse.json({ id: u.id }, { status: 201 })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message ?? err.message }, { status: 400 })
    return apiError(err)
  }
}
