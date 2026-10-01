import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { sesionPreguntas } from '@/lib/preguntasSesion'
import { ErrorML } from '@/lib/ml'
import { adjuntoDeHilo } from '@/lib/mensajesML'

const TIPOS: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
  pdf: 'application/pdf', txt: 'text/plain; charset=utf-8',
}

// GET /api/mensajes/[pack]/adjunto?f=archivo → el adjunto (foto, PDF…) que mandó el comprador,
// traído de MercadoLibre. Solo archivos de esa conversación.
export async function GET(req: NextRequest, { params }: { params: Promise<{ pack: string }> }) {
  const s = await sesionPreguntas()
  if ('error' in s) return s.error
  const { pack } = await params
  const f = new URL(req.url).searchParams.get('f') ?? ''
  if (!/^\d+$/.test(pack) || !/^[\w.\-]{1,200}$/.test(f)) return NextResponse.json({ error: 'Adjunto inválido' }, { status: 400 })
  try {
    const { rows: [c] } = await s.db.query(`SELECT conexion_id FROM ml_conversaciones WHERE pack_id = $1`, [pack])
    if (!c) return NextResponse.json({ error: 'Conversación no encontrada' }, { status: 404 })
    const r = await adjuntoDeHilo(s.db, c.conexion_id, pack, f)
    if (!r) return NextResponse.json({ error: 'El adjunto no es de esta conversación' }, { status: 404 })
    // ML a veces responde "application/octet-stream": se deduce por la extensión (fotos y PDF).
    const tipoML = r.headers.get('content-type') ?? ''
    const ext = f.split('.').pop()?.toLowerCase() ?? ''
    const tipo = tipoML && !tipoML.includes('octet-stream') ? tipoML : (TIPOS[ext] ?? 'application/octet-stream')
    return new NextResponse(r.body, {
      headers: {
        'Content-Type': tipo,
        'Content-Disposition': `inline; filename="${f}"`,
        'Cache-Control': 'private, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (err) {
    if (err instanceof ErrorML) return NextResponse.json({ error: err.message }, { status: 502 })
    return apiError(err)
  }
}
