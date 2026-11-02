import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { dbGlobal } from '@/lib/db'
import { entrarParaRenovar, firmarAcceso } from '@/lib/cobros'

// POST /api/mi-plan/entrar { usuario, clave } → acceso firmado (2 h) para Mi plan desde /renovar.
// Es para la cuenta vencida, que no puede iniciar sesión: con ese acceso solo ve su plan y reporta el pago.
const Body = z.object({ usuario: z.string().trim().min(1).max(100), clave: z.string().min(1).max(200) })

export async function POST(req: NextRequest) {
  try {
    const b = Body.safeParse(await req.json().catch(() => ({})))
    if (!b.success) return NextResponse.json({ error: 'Escribe tu usuario y contraseña' }, { status: 400 })
    const r = await entrarParaRenovar(dbGlobal(), b.data.usuario, b.data.clave)
    if (!r) {
      await new Promise(ok => setTimeout(ok, 800))   // frena intentos seguidos de contraseña
      return NextResponse.json({ error: 'Usuario o contraseña incorrectos' }, { status: 401 })
    }
    if (!r.orgId) return NextResponse.json({ error: 'El pago del plan lo hace el administrador de la cuenta.' }, { status: 403 })
    return NextResponse.json({ acceso: firmarAcceso(r.userId, r.orgId) })
  } catch (err) {
    return apiError(err)
  }
}
