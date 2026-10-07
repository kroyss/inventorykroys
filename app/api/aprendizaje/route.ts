import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { apiError } from '@/lib/apiError'
import { linkAgendar, videosDeUsuario } from '@/lib/aprendizaje'
import { llevaInventario, tieneModulo } from '@/lib/modulos'
import { sinCuentasML } from '@/lib/preguntasSesion'
import { ORGANIZACION_PLATAFORMA } from '@/lib/empresa'
import { esDemoEmpresa } from '@/lib/demo'
import { unauthorized } from '@/lib/session'

// GET /api/aprendizaje → videos activos con el avance del usuario y el link de "agendar".
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return unauthorized()
  try {
    const [videos, agendar, sinCuentas] = await Promise.all([videosDeUsuario(session.user.id, llevaInventario(session.user)), linkAgendar(),
      session.user.empresaId && tieneModulo(session.user, 'preguntas') ? sinCuentasML(session).catch(() => false) : false])
    // Exento: la organización de la plataforma (SolucionesMC) ya está capacitada. Ve Aprendizaje como
    // completado (libro gris, sin ventana de bienvenida) aunque su avance real no lo esté.
    const exento = session.user.organizacionId === ORGANIZACION_PLATAFORMA
    // Demostración: sin ventana de bienvenida (se graba la cuenta desde el primer login).
    const demo = session.user.empresaId ? await esDemoEmpresa(session.user.empresaId, session.user.country) : false
    // inventario: si la empresa lo lleva (si no, al terminar se le ofrece activarlo).
    return NextResponse.json({ videos, agendar, sinCuentas, esAdmin: session.user.role === 'admin', exento, demo,
      inventario: llevaInventario(session.user) },
      { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    return apiError(err)
  }
}
