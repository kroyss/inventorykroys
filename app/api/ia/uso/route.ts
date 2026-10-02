import { NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { sesionPreguntas } from '@/lib/preguntasSesion'
import { usoDelMes } from '@/lib/ia'
import { esDuenoPlataforma } from '@/lib/empresa'

// GET /api/ia/uso → lo gastado en IA este mes. INTERNO: solo el dueño de la plataforma (en la fase
// Fundadores la IA la paga la plataforma; ver lib/funcionesInternas.ts y Plataforma → Interno).
export async function GET() {
  const s = await sesionPreguntas(true)
  if ('error' in s) return s.error
  if (!esDuenoPlataforma(s.session.user)) return NextResponse.json({ error: 'No disponible' }, { status: 403 })
  try {
    return NextResponse.json(await usoDelMes(s.db))
  } catch (err) {
    return apiError(err)
  }
}
