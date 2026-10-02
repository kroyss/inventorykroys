import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { apiError } from '@/lib/apiError'
import { unauthorized } from '@/lib/session'
import { linkAgendar, videosDeUsuario } from '@/lib/aprendizaje'

// GET /api/aprendizaje → videos activos con el avance del usuario y el link de "agendar".
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return unauthorized()
  try {
    const [videos, agendar] = await Promise.all([videosDeUsuario(session.user.id), linkAgendar()])
    return NextResponse.json({ videos, agendar }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    return apiError(err)
  }
}
