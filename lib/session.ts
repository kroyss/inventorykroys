import { getServerSession, type Session } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { dbEmpresa } from '@/lib/db'
import { NextResponse } from 'next/server'

/** Conexión a la empresa de la sesión: todo lo que consulte ve solo esa empresa (RLS). */
export function dbDeSesion(session: Session) {
  return dbEmpresa(session.user.empresaId, session.user.country)
}

export async function getSessionDb() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.empresaId) return { session: null, db: null }
  return { session, db: dbDeSesion(session) }
}

export function forbidden() {
  return NextResponse.json({ error: 'Prohibido' }, { status: 403 })
}

export function unauthorized() {
  return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
}
