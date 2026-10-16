import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { apiError } from '@/lib/apiError'
import { unauthorized } from '@/lib/session'
import { dbGlobal } from '@/lib/db'

/** POST /api/novedades/vistas → abrió el panel: el puntito se apaga hasta la próxima novedad. */
export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return unauthorized()
  try {
    await dbGlobal().query(`UPDATE users SET novedades_vistas_at = NOW() WHERE id = $1`, [parseInt(session.user.id, 10)])
    return NextResponse.json({ ok: true })
  } catch (err) {
    return apiError(err)
  }
}
