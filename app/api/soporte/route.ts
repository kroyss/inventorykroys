import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { apiError } from '@/lib/apiError'
import { unauthorized } from '@/lib/session'
import { dbGlobal } from '@/lib/db'
import { escribirASoporte, MAX_ADJUNTOS, MAX_MB, TIPOS_ADJUNTO, type Adjunto } from '@/lib/soporte'

// GET /api/soporte → mis casos (los últimos 20) con sus mensajes y cuántos tienen respuesta sin ver.
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return unauthorized()
  try {
    const { rows: casos } = await dbGlobal().query(
      `SELECT c.id, c.estado, c.created_at, c.updated_at,
              EXISTS (SELECT 1 FROM soporte_mensajes m WHERE m.caso_id = c.id AND m.autor = 'soporte'
                        AND m.created_at > COALESCE(c.cliente_visto_at, '-infinity')) AS nuevo,
              COALESCE((SELECT json_agg(json_build_object('id', m.id, 'autor', m.autor, 'texto', m.texto,
                          'adjuntos', m.adjuntos, 'created_at', m.created_at) ORDER BY m.id)
                        FROM soporte_mensajes m WHERE m.caso_id = c.id), '[]') AS mensajes
       FROM soporte_casos c WHERE c.user_id = $1 AND c.origen = 'sistema'
       ORDER BY c.updated_at DESC LIMIT 20`, [Number(session.user.id)])
    return NextResponse.json({ casos, nuevos: casos.filter(c => c.nuevo).length }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    return apiError(err)
  }
}

// POST /api/soporte (multipart: texto, pantalla, navegador, caso_id?, archivos[]) → caso nuevo o un mensaje más.
export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return unauthorized()
  if (session.user.soporte || session.user.verComo)
    return NextResponse.json({ error: 'Estás viendo como otra persona: soporte no se escribe desde aquí.' }, { status: 400 })
  try {
    const f = await req.formData()
    const texto = String(f.get('texto') ?? '').trim().slice(0, 4000)
    const archivos = f.getAll('archivos').filter((x): x is File => typeof x !== 'string' && x.size > 0)
    if (!texto && !archivos.length) return NextResponse.json({ error: 'Escribe qué pasó' }, { status: 400 })
    if (archivos.length > MAX_ADJUNTOS) return NextResponse.json({ error: `Máximo ${MAX_ADJUNTOS} archivos` }, { status: 400 })
    const adjuntos: Adjunto[] = []
    for (const a of archivos) {
      if (!TIPOS_ADJUNTO[a.type]) return NextResponse.json({ error: `«${a.name}»: solo imágenes (PNG, JPG) o PDF` }, { status: 400 })
      if (a.size > MAX_MB * 1024 * 1024) return NextResponse.json({ error: `«${a.name}» pesa más de ${MAX_MB} MB` }, { status: 400 })
      adjuntos.push({ nombre: a.name || 'captura', tipo: a.type, datos: Buffer.from(await a.arrayBuffer()) })
    }
    const casoId = Number(f.get('caso_id') ?? 0) || undefined
    const id = await escribirASoporte({
      origen: 'sistema', userId: Number(session.user.id), empresaId: session.user.empresaId ?? null,
      pantalla: String(f.get('pantalla') ?? ''), navegador: String(f.get('navegador') ?? req.headers.get('user-agent') ?? ''),
    }, texto, adjuntos, casoId)
    return NextResponse.json({ id })
  } catch (err) {
    if (err instanceof Error && err.message === 'Caso no encontrado') return NextResponse.json({ error: err.message }, { status: 404 })
    return apiError(err)
  }
}
