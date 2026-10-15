// Sesión de "Mis avisos": cualquier usuario (cada persona elige lo suyo), si su organización ya
// tiene los avisos (lib/avisosTelegram.ts → avisosHabilitados).
import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { unauthorized } from '@/lib/session'
import { avisosHabilitados } from '@/lib/avisosTelegram'

export async function sesionAvisos() {
  const session = await getServerSession(authOptions)
  const u = session?.user
  if (!u?.id || !u.empresaId) return { error: unauthorized() }
  if (!(await avisosHabilitados(u.organizacionId))) {
    return { error: NextResponse.json({ error: 'Los avisos por Telegram todavía no están disponibles para tu cuenta' }, { status: 403 }) }
  }
  return { user: u, userId: Number(u.id), empresaId: u.empresaId }
}
