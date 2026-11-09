import { NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { sesionMiIA } from '@/lib/miIASesion'
import { probarMensajesIA } from '@/lib/mensajesIAProbar'
import { iaConfigurada } from '@/lib/ia'
import { tieneModulo } from '@/lib/modulos'
import { contarPrueba, ERROR_TOPE, puedeProbar } from '@/lib/miIAPruebasTope'

// POST /api/mi-ia/probar-mensajes → Mi IA (09-11): la IA responde 10 mensajes reales de compradores que el equipo ya
// contestó. No manda nada ni usa créditos.
export async function POST() {
  const s = await sesionMiIA()
  if ('error' in s) return s.error
  if (!tieneModulo(s.session.user, 'mensajes_ia')) return NextResponse.json({ error: 'Tu empresa no tiene la IA de Mensajes' }, { status: 403 })
  if (!iaConfigurada()) return NextResponse.json({ error: 'La IA no está configurada' }, { status: 503 })
  try {
    if (!(await puedeProbar(s.db, s.session.user, 'mensajes'))) return NextResponse.json({ error: ERROR_TOPE }, { status: 429 })
    const casos = await probarMensajesIA(s.db, s.session.user.country, tieneModulo(s.session.user, 'inventario'), s.session.user.id)
    await contarPrueba(s.db, s.session.user, 'mensajes')
    return NextResponse.json({ casos })
  } catch (err) { return apiError(err) }
}
