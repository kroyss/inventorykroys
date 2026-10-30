import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { apiError } from '@/lib/apiError'
import { unauthorized } from '@/lib/session'
import { dbGlobal } from '@/lib/db'

const Voto = z.object({ util: z.union([z.literal(1), z.literal(-1)]) })

// PUT /api/ayuda/consultas/[id] → 👍 / 👎 de una respuesta (solo la propia).
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return unauthorized()
  const { id } = await params
  const v = Voto.safeParse(await req.json().catch(() => null))
  if (!v.success) return NextResponse.json({ error: 'Voto inválido' }, { status: 400 })
  try {
    await dbGlobal().query(`UPDATE ayuda_consultas SET util = $3 WHERE id = $1 AND user_id = $2`, [Number(id), Number(session.user.id), v.data.util])
    return NextResponse.json({ ok: true })
  } catch (err) {
    return apiError(err)
  }
}
