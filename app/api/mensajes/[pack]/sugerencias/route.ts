import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { sesionPreguntas } from '@/lib/preguntasSesion'
import { sugerenciasMensaje } from '@/lib/mensajesML'

// GET /api/mensajes/[pack]/sugerencias → lo que ya se respondió a mensajes parecidos (gratis, sin IA).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ pack: string }> }) {
  const s = await sesionPreguntas()
  if ('error' in s) return s.error
  const { pack } = await params
  if (!/^\d+$/.test(pack)) return NextResponse.json({ error: 'Conversación inválida' }, { status: 400 })
  try {
    return NextResponse.json(await sugerenciasMensaje(s.db, pack))
  } catch (err) {
    return apiError(err)
  }
}
