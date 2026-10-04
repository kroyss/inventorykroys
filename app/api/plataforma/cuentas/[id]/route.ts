import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { dbGlobal } from '@/lib/db'
import { PRODUCTOS } from '@/lib/productos'
import { soloDueno } from '@/lib/plataforma'
import { hash } from 'bcryptjs'
import { PASSWORD_MAX, PASSWORD_MIN } from '@/lib/usuarios'

const productosValidos = Object.keys(PRODUCTOS) as [string, ...string[]]
const Schema = z.object({
  email:     z.string().trim().toLowerCase().email('Correo inválido').max(120).or(z.literal('')).optional(),
  productos: z.array(z.enum(productosValidos)).optional(),
  full_name: z.string().trim().min(2, 'Nombre muy corto').max(100).optional(),
  is_active: z.boolean().optional(),
  password:  z.string().min(PASSWORD_MIN, `La contraseña debe tener al menos ${PASSWORD_MIN} caracteres`).max(PASSWORD_MAX).optional(),
})

/** PUT /api/plataforma/cuentas/[id] — correo, productos, nombre, activa y nueva clave de una cuenta.
 *  Desactivar o cambiar la clave cierra sus sesiones abiertas (session_version). */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  const { session, error } = await soloDueno()
  if (error) return error
  try {
    const body = Schema.parse(await req.json())
    if (body.is_active === false && Number(id) === Number(session!.user.id)) {
      return NextResponse.json({ error: 'No puedes desactivar tu propia cuenta' }, { status: 400 })
    }
    const corta = body.is_active === false || body.password !== undefined
    const { rowCount } = await dbGlobal().query(
      `UPDATE users SET
         email     = CASE WHEN $2::text IS NULL THEN email ELSE NULLIF($2, '') END,
         productos = COALESCE($3, productos),
         full_name = COALESCE($4, full_name),
         is_active = COALESCE($5, is_active),
         password_hash = COALESCE($6, password_hash)
         ${corta ? ', session_version = session_version + 1' : ''}
       WHERE id = $1`,
      [id, body.email ?? null, body.productos ?? null, body.full_name ?? null, body.is_active ?? null,
       body.password ? await hash(body.password, 10) : null])
    if (!rowCount) return NextResponse.json({ error: 'Cuenta no encontrada' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message ?? err.message }, { status: 400 })
    if ((err as { code?: string }).code === '23505') return NextResponse.json({ error: 'Ese correo ya está en otra cuenta' }, { status: 400 })
    return apiError(err)
  }
}

/** DELETE /api/plataforma/cuentas/[id] — borra la cuenta. Si ya registró movimientos (ventas,
 *  despachos…) no se puede: su nombre queda en el historial, así que se desactiva en su lugar. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  const { session, error } = await soloDueno()
  if (error) return error
  if (Number(id) === Number(session!.user.id)) return NextResponse.json({ error: 'No puedes eliminar tu propia cuenta' }, { status: 400 })
  try {
    const { rowCount } = await dbGlobal().query(`DELETE FROM users WHERE id = $1`, [id])
    if (!rowCount) return NextResponse.json({ error: 'Cuenta no encontrada' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    if ((err as { code?: string }).code === '23503') {
      return NextResponse.json({ error: 'Esta cuenta ya tiene movimientos registrados (ventas, despachos, etc.): no se puede borrar sin perder ese historial. Desactívala: ya no podrá entrar.' }, { status: 400 })
    }
    return apiError(err)
  }
}
