import { NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { sesionMiIA } from '@/lib/miIASesion'
import { sugerirMiIA } from '@/lib/miIASugerir'
import { iaConfigurada } from '@/lib/ia'

// POST /api/mi-ia/sugerir → Mi IA, Parte C: lo que se entiende de sus respuestas, descripciones y políticas.
// Solo propone; no guarda nada (lo guarda el cuestionario al dar Siguiente).
export async function POST() {
  const s = await sesionMiIA()
  if ('error' in s) return s.error
  if (!iaConfigurada()) return NextResponse.json({ error: 'La IA no está configurada' }, { status: 503 })
  try {
    return NextResponse.json(await sugerirMiIA(s.db, s.session.user.id))
  } catch (err) { return apiError(err) }
}
