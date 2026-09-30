import { NextResponse } from 'next/server'
import { getSessionDb } from '@/lib/session'
import { tieneModulo } from '@/lib/modulos'

/** Sesión + conexión de la empresa para las rutas de Preguntas (módulo `preguntas`). */
export async function sesionPreguntas(soloAdmin = false) {
  const { session, db } = await getSessionDb()
  if (!session || !db) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) } as const
  if (!tieneModulo(session.user, 'preguntas')) {
    return { error: NextResponse.json({ error: 'Tu empresa no tiene el módulo Preguntas' }, { status: 403 }) } as const
  }
  if (soloAdmin && session.user.role !== 'admin') {
    return { error: NextResponse.json({ error: 'Solo un administrador puede hacer esto' }, { status: 403 }) } as const
  }
  return { session, db } as const
}
