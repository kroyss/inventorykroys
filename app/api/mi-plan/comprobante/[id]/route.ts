import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { apiError } from '@/lib/apiError'
import { forbidden, unauthorized } from '@/lib/session'
import { esDuenoPlataforma } from '@/lib/empresa'
import { leerComprobante, verificarAcceso } from '@/lib/cobros'

// GET /api/mi-plan/comprobante/[id] → la captura de un pago reportado. La ven el dueño de la plataforma y el admin
// de esa organización (con sesión o con el acceso de /renovar, ?acceso=...). Nadie más.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  try {
    const c = await leerComprobante(Number(id))
    if (!c) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
    const firmado = verificarAcceso(req.nextUrl.searchParams.get('acceso'))
    if (!(firmado && firmado.orgId === c.org)) {
      const session = await getServerSession(authOptions)
      if (!session?.user) return unauthorized()
      const suya = session.user.role === 'admin' && session.user.organizacionId === c.org
      if (!suya && !esDuenoPlataforma(session.user)) return forbidden()
    }
    return new NextResponse(new Uint8Array(c.datos), {
      headers: { 'Content-Type': c.tipo, 'Cache-Control': 'private, no-store', 'Content-Disposition': `inline; filename="pago-${id}.${c.tipo.split('/')[1]}"` },
    })
  } catch (err) {
    return apiError(err)
  }
}
