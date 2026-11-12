import { NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { sesionMiIA } from '@/lib/miIASesion'
import { sugerirMiIA } from '@/lib/miIASugerir'
import { iaConfigurada } from '@/lib/ia'
import { contarPrueba, ERROR_TOPE_SUGERIR, puedeProbar } from '@/lib/miIAPruebasTope'

// POST /api/mi-ia/sugerir → Mi IA, Parte C: lo que se entiende de sus respuestas, descripciones y políticas.
// Solo propone; no guarda nada (lo guarda el cuestionario al dar Siguiente).
export async function POST() {
  const s = await sesionMiIA()
  if ('error' in s) return s.error
  if (!iaConfigurada()) return NextResponse.json({ error: 'La IA no está configurada' }, { status: 503 })
  try {
    // 12-11 (el dueño): hasta 3 por día (gasta tokens nuestros; no descuenta créditos).
    if (!(await puedeProbar(s.db, s.session.user, 'sugerir'))) return NextResponse.json({ error: ERROR_TOPE_SUGERIR }, { status: 429 })
    const r = await sugerirMiIA(s.db, s.session.user.id)
    await contarPrueba(s.db, s.session.user, 'sugerir')
    return NextResponse.json(r)
  } catch (err) { return apiError(err) }
}
