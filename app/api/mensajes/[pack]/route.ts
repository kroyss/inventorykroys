import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { sesionPreguntas } from '@/lib/preguntasSesion'
import { ErrorML } from '@/lib/ml'
import { leerHilo, responderHilo } from '@/lib/mensajesML'
import { problemasDelTexto } from '@/lib/preguntasTexto'

async function conversacion(db: import('pg').Pool, pack: string) {
  const { rows: [c] } = await db.query(
    `SELECT c.conexion_id, x.ml_user_id, x.nickname FROM ml_conversaciones c JOIN ml_conexiones x ON x.id = c.conexion_id
     WHERE c.pack_id = $1`, [pack])
  return c as { conexion_id: number; ml_user_id: string; nickname: string } | undefined
}

// GET  /api/mensajes/[pack]            → la conversación completa (no la marca como leída)
// GET  /api/mensajes/[pack]?leida=1    → y la marca como leída en ML
// POST /api/mensajes/[pack] { texto, dejarSinLeer? } → responde (y queda leída, salvo dejarSinLeer)
export async function GET(req: NextRequest, { params }: { params: Promise<{ pack: string }> }) {
  const s = await sesionPreguntas()
  if ('error' in s) return s.error
  const { pack } = await params
  if (!/^\d+$/.test(pack)) return NextResponse.json({ error: 'Conversación inválida' }, { status: 400 })
  try {
    const c = await conversacion(s.db, pack)
    if (!c) return NextResponse.json({ error: 'Conversación no encontrada' }, { status: 404 })
    const marcar = new URL(req.url).searchParams.get('leida') === '1'
    const h = await leerHilo(s.db, c.conexion_id, pack, Number(c.ml_user_id), marcar)
    if (marcar) await s.db.query(`UPDATE ml_conversaciones SET sin_leer = 0, actualizada_at = NOW() WHERE pack_id = $1`, [pack])
    return NextResponse.json({ cuenta: c.nickname, ...h })
  } catch (err) {
    return apiError(err)
  }
}

const Body = z.object({ texto: z.string().trim().min(1).max(350), dejarSinLeer: z.boolean().optional() })

export async function POST(req: NextRequest, { params }: { params: Promise<{ pack: string }> }) {
  const s = await sesionPreguntas()
  if ('error' in s) return s.error
  const { pack } = await params
  if (!/^\d+$/.test(pack)) return NextResponse.json({ error: 'Conversación inválida' }, { status: 400 })
  try {
    const { texto, dejarSinLeer } = Body.parse(await req.json())
    const problemas = problemasDelTexto(texto)
    if (problemas.length) return NextResponse.json({ error: 'MercadoLibre rechazaría este mensaje', problemas }, { status: 422 })
    const c = await conversacion(s.db, pack)
    if (!c) return NextResponse.json({ error: 'Conversación no encontrada' }, { status: 404 })
    try {
      const h = await responderHilo(s.db, c.conexion_id, pack, texto, dejarSinLeer)
      return NextResponse.json({ cuenta: c.nickname, ...h })
    } catch (e) {
      if (e instanceof ErrorML) return NextResponse.json({ error: e.message, detalle: e.datos }, { status: 502 })
      throw e
    }
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message ?? err.message }, { status: 400 })
    return apiError(err)
  }
}
