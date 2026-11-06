import { NextResponse } from 'next/server'
import { sesionPreguntas } from '@/lib/preguntasSesion'
import { tieneModulo } from '@/lib/modulos'

/** Sesión de Mi IA (/api/mi-ia y sus rutas): permiso de configurar automatizaciones + módulo mi_ia. */
export async function sesionMiIA() {
  const s = await sesionPreguntas('automatizaciones_config')
  if ('error' in s) return s
  if (!tieneModulo(s.session.user, 'mi_ia')) return { error: NextResponse.json({ error: 'Tu empresa no tiene Mi IA' }, { status: 403 }) } as const
  return s
}
