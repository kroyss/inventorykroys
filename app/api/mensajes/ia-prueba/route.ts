import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { sesionPreguntas } from '@/lib/preguntasSesion'
import { tieneModulo } from '@/lib/modulos'
import { listaPrueba } from '@/lib/mensajesIAPrueba'

// Mensajes → IA en prueba (mig 145, lib/mensajesIAPrueba.ts). GET → los casos y el resumen · POST → marcar Bien / Mal.
async function sesion() {
  const s = await sesionPreguntas()
  if ('error' in s) return s
  if (!tieneModulo(s.session.user, 'mensajes_ia')) return { error: NextResponse.json({ error: 'Tu empresa no tiene la IA de Mensajes en prueba' }, { status: 403 }) } as const
  return s
}

export async function GET() {
  const s = await sesion()
  if ('error' in s) return s.error
  try {
    return NextResponse.json(await listaPrueba(s.db))
  } catch (err) { return apiError(err) }
}

const Marca = z.object({ id: z.string().regex(/^\d+$/), marca: z.enum(['bien', 'mal']).nullable() })

export async function POST(req: NextRequest) {
  const s = await sesion()
  if ('error' in s) return s.error
  try {
    const p = Marca.safeParse(await req.json())
    if (!p.success) return NextResponse.json({ error: p.error.message }, { status: 400 })
    await s.db.query(
      `UPDATE ml_mensajes_ia SET marca = $2, marcada_por = CASE WHEN $2::text IS NULL THEN NULL ELSE $3::int END,
         marcada_at = CASE WHEN $2::text IS NULL THEN NULL ELSE NOW() END WHERE id = $1`,
      [p.data.id, p.data.marca, s.session.user.id])
    return NextResponse.json({ ok: true })
  } catch (err) { return apiError(err) }
}
