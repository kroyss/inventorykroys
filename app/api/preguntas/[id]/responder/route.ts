import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/apiError'
import { sesionPreguntas } from '@/lib/preguntasSesion'
import { problemasDelTexto } from '@/lib/preguntas'
import { OrigenRespuesta } from '@/lib/respuestasOrigen'
import { publicarRespuesta } from '@/lib/responderPregunta'

const Body = z.object({ texto: z.string().min(1).max(2000) }).merge(OrigenRespuesta)

// POST /api/preguntas/[id]/responder { texto, fuente?, base?, plantilla? } → publica la respuesta en
// MercadoLibre (lib/responderPregunta.ts: relee para confirmar, guarda el origen y aprende).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const s = await sesionPreguntas()
  if ('error' in s) return s.error
  const { id } = await params
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: 'Pregunta inválida' }, { status: 400 })
  try {
    const { texto, fuente, base, plantilla } = Body.parse(await req.json())
    const problemas = problemasDelTexto(texto)
    if (problemas.length) {
      return NextResponse.json({ error: 'MercadoLibre rechazaría esta respuesta', problemas }, { status: 422 })
    }
    const r = await publicarRespuesta(s.db, id, texto, { usuarioId: s.session.user.id, fuente, base, plantilla })
    if (!r.ok) return NextResponse.json({ error: r.error, ...(r.codigo ? { codigo: r.codigo } : {}) }, { status: r.status })
    return NextResponse.json({ publicada: r.publicada, estado: r.estado, respuesta_estado: r.respuesta_estado, aviso: r.aviso })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.message }, { status: 400 })
    return apiError(err)
  }
}
