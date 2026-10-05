import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { apiError } from '@/lib/apiError'
import { unauthorized } from '@/lib/session'
import { linkAgendar, videosDeUsuario } from '@/lib/aprendizaje'
import { tieneModulo } from '@/lib/modulos'
import { sinCuentasML } from '@/lib/preguntasSesion'

// GET /api/aprendizaje → videos activos con el avance del usuario y el link de "agendar".
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return unauthorized()
  try {
    const [videos, agendar, sinCuentas] = await Promise.all([videosDeUsuario(session.user.id), linkAgendar(),
      session.user.empresaId && tieneModulo(session.user, 'preguntas') ? sinCuentasML(session).catch(() => false) : false])
    return NextResponse.json({ videos, agendar, sinCuentas, esAdmin: session.user.role === 'admin' },
      { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    return apiError(err)
  }
}
