import { NextResponse } from 'next/server'
import { dbGlobal } from '@/lib/db'
import { externoAutorizado, noAutorizado } from '@/lib/externo'
import { leerAdjunto } from '@/lib/soporte'

const TIPO: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', pdf: 'application/pdf' }

// GET /api/externo/soporte/adjunto?user_id=N&caso=N&archivo=X → una captura de un caso del Radar de esa persona.
export async function GET(req: Request) {
  if (!externoAutorizado(req)) return noAutorizado()
  const u = new URL(req.url)
  const caso = Number(u.searchParams.get('caso')), archivo = u.searchParams.get('archivo') ?? ''
  const { rowCount } = await dbGlobal().query(`SELECT 1 FROM soporte_casos WHERE id = $1 AND user_id = $2 AND origen = 'radar'`,
    [caso, Number(u.searchParams.get('user_id'))])
  if (!rowCount) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  const datos = await leerAdjunto(caso, archivo)
  if (!datos) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  return new NextResponse(new Uint8Array(datos), { headers: { 'Content-Type': TIPO[archivo.split('.').pop() ?? ''] ?? 'application/octet-stream' } })
}
