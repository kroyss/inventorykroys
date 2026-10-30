import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { unauthorized } from '@/lib/session'
import { dbGlobal } from '@/lib/db'
import { esDuenoPlataforma } from '@/lib/empresa'
import { leerAdjunto } from '@/lib/soporte'

const TIPO: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', pdf: 'application/pdf' }

// GET /api/soporte/adjunto?caso=N&archivo=X → una captura del caso (su autor o el dueño de la plataforma).
export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return unauthorized()
  const u = new URL(req.url)
  const caso = Number(u.searchParams.get('caso')), archivo = u.searchParams.get('archivo') ?? ''
  if (!esDuenoPlataforma(session.user)) {
    const { rowCount } = await dbGlobal().query(`SELECT 1 FROM soporte_casos WHERE id = $1 AND user_id = $2`, [caso, Number(session.user.id)])
    if (!rowCount) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  }
  const datos = await leerAdjunto(caso, archivo)
  if (!datos) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  return new NextResponse(new Uint8Array(datos), {
    headers: { 'Content-Type': TIPO[archivo.split('.').pop() ?? ''] ?? 'application/octet-stream', 'Cache-Control': 'private, max-age=3600' },
  })
}
