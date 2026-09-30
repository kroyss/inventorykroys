import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { dbGlobal } from '@/lib/db'
import { PRODUCTOS } from '@/lib/productos'
import { soloDueno } from '@/lib/plataforma'

const productosValidos = Object.keys(PRODUCTOS) as [string, ...string[]]
const Schema = z.object({
  email:     z.string().trim().toLowerCase().email('Correo inválido').max(120).or(z.literal('')).optional(),
  productos: z.array(z.enum(productosValidos)).optional(),
})

/** PUT /api/plataforma/cuentas/[id] — correo y productos de una cuenta. */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  const { error } = await soloDueno()
  if (error) return error
  try {
    const body = Schema.parse(await req.json())
    const { rowCount } = await dbGlobal().query(
      `UPDATE users SET
         email     = CASE WHEN $2::text IS NULL THEN email ELSE NULLIF($2, '') END,
         productos = COALESCE($3, productos)
       WHERE id = $1`,
      [id, body.email ?? null, body.productos ?? null])
    if (!rowCount) return NextResponse.json({ error: 'Cuenta no encontrada' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message ?? err.message }, { status: 400 })
    if ((err as { code?: string }).code === '23505') return NextResponse.json({ error: 'Ese correo ya está en otra cuenta' }, { status: 400 })
    return apiError(err)
  }
}
