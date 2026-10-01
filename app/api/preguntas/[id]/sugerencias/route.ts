import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { sesionPreguntas } from '@/lib/preguntasSesion'
import { sugerenciasPregunta } from '@/lib/preguntas'

// GET /api/preguntas/[id]/sugerencias → respuestas propias a preguntas parecidas (gratis, sin IA).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const s = await sesionPreguntas()
  if ('error' in s) return s.error
  const { id } = await params
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: 'Pregunta inválida' }, { status: 400 })
  try {
    return NextResponse.json({ sugerencias: await sugerenciasPregunta(s.db, Number(id)) })
  } catch (err) {
    return apiError(err)
  }
}
