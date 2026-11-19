import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { apiError } from '@/lib/apiError'
import { dbGlobal } from '@/lib/db'
import { unauthorized } from '@/lib/session'

const Body = z.object({ activa: z.boolean() })

// PUT /api/aprendizaje/ayuda → { activa } (19-11, mig. 187): el ícono de Ayuda en todas las pantallas o solo en
// Aprendizaje. Es de la persona (users), no de la empresa. En «Ver como» no cambia nada de la otra persona.
export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return unauthorized()
  try {
    const p = Body.safeParse(await req.json().catch(() => null))
    if (!p.success) return NextResponse.json({ error: p.error.message }, { status: 400 })
    if (session.user.verComo) return NextResponse.json({ error: 'En «Ver como» no se cambia la configuración de la otra persona' }, { status: 403 })
    await dbGlobal().query(`UPDATE users SET ayuda_flotante = $2 WHERE id = $1`, [session.user.id, p.data.activa])
    return NextResponse.json({ ok: true, activa: p.data.activa })
  } catch (err) {
    return apiError(err)
  }
}
