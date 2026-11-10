import { NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { sesionMiIA } from '@/lib/miIASesion'
import { probarMiIA } from '@/lib/miIAProbar'
import { iaConfigurada } from '@/lib/ia'
import { contarPrueba, ERROR_TOPE, puedeProbar } from '@/lib/miIAPruebasTope'
import { guardarPrueba } from '@/lib/miIAPruebas'

// POST /api/mi-ia/probar → Mi IA, Parte D: la IA responde 10 preguntas reales ya contestadas (no publica nada).
export async function POST() {
  const s = await sesionMiIA()
  if ('error' in s) return s.error
  if (!iaConfigurada()) return NextResponse.json({ error: 'La IA no está configurada' }, { status: 503 })
  try {
    // 09-11: gratis, máximo 2 por día (lib/miIAPruebasTope.ts).
    if (!(await puedeProbar(s.db, s.session.user, 'preguntas'))) return NextResponse.json({ error: ERROR_TOPE }, { status: 429 })
    const casos = await probarMiIA(s.db, s.session.user.country, s.session.user.id)
    await contarPrueba(s.db, s.session.user, 'preguntas')
    const id = await guardarPrueba(s.db, 'preguntas', casos, s.session.user.id)   // 10-11: historial (mig 164)
    return NextResponse.json({ casos, id })
  } catch (err) { return apiError(err) }
}
