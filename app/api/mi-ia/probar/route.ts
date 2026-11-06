import { NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { sesionMiIA } from '@/lib/miIASesion'
import { probarMiIA } from '@/lib/miIAProbar'
import { iaConfigurada } from '@/lib/ia'

// POST /api/mi-ia/probar → Mi IA, Parte D: la IA responde 10 preguntas reales ya contestadas (no publica nada).
export async function POST() {
  const s = await sesionMiIA()
  if ('error' in s) return s.error
  if (!iaConfigurada()) return NextResponse.json({ error: 'La IA no está configurada' }, { status: 503 })
  try {
    return NextResponse.json({ casos: await probarMiIA(s.db, s.session.user.country, s.session.user.id) })
  } catch (err) { return apiError(err) }
}
