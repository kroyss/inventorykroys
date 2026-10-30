import { NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { dbGlobal } from '@/lib/db'
import { cuentaValida, externoAutorizado, noAutorizado } from '@/lib/externo'
import { escribirASoporte, MAX_ADJUNTOS, MAX_MB, TIPOS_ADJUNTO, type Adjunto } from '@/lib/soporte'

// GET /api/externo/soporte?user_id=N → los casos del Radar de esa persona. Servidor a servidor.
export async function GET(req: Request) {
  if (!externoAutorizado(req)) return noAutorizado()
  const userId = Number(new URL(req.url).searchParams.get('user_id'))
  try {
    const { rows: casos } = await dbGlobal().query(
      `SELECT c.id, c.estado, c.created_at, c.updated_at,
              EXISTS (SELECT 1 FROM soporte_mensajes m WHERE m.caso_id = c.id AND m.autor = 'soporte'
                        AND m.created_at > COALESCE(c.cliente_visto_at, '-infinity')) AS nuevo,
              COALESCE((SELECT json_agg(json_build_object('id', m.id, 'autor', m.autor, 'texto', m.texto,
                          'adjuntos', m.adjuntos, 'created_at', m.created_at) ORDER BY m.id)
                        FROM soporte_mensajes m WHERE m.caso_id = c.id), '[]') AS mensajes
       FROM soporte_casos c WHERE c.user_id = $1 AND c.origen = 'radar'
       ORDER BY c.updated_at DESC LIMIT 20`, [userId])
    return NextResponse.json({ casos, nuevos: casos.filter(c => c.nuevo).length })
  } catch (err) {
    return apiError(err)
  }
}

// POST /api/externo/soporte (multipart: user_id, texto, pantalla, navegador, caso_id?, archivos[]) → caso del Radar.
export async function POST(req: Request) {
  if (!externoAutorizado(req)) return noAutorizado()
  try {
    const f = await req.formData()
    const userId = Number(f.get('user_id'))
    if (!(await cuentaValida(userId))) return NextResponse.json({ error: 'Cuenta no válida' }, { status: 403 })
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
    const id = await escribirASoporte({ origen: 'radar', userId, empresaId: null,
      pantalla: String(f.get('pantalla') ?? ''), navegador: String(f.get('navegador') ?? '') },
      texto, adjuntos, Number(f.get('caso_id') ?? 0) || undefined)
    return NextResponse.json({ id })
  } catch (err) {
    if (err instanceof Error && err.message === 'Caso no encontrado') return NextResponse.json({ error: err.message }, { status: 404 })
    return apiError(err)
  }
}
