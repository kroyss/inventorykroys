import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function getSessionDb() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return { session: null, db: null }
  const db = getDb(session.user.country)
  return { session, db }
}

export function forbidden() {
  return NextResponse.json({ error: 'Prohibido' }, { status: 403 })
}

export function unauthorized() {
  return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
}
