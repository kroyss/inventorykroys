import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { avisosHabilitados } from '@/lib/avisosTelegram'
import MisAvisosClient from '@/components/avisos/MisAvisosClient'
import { deApi } from '@/lib/inicial'
import { GET as avisosTelegram } from '@/app/api/avisos-telegram/route'

export const metadata = { title: 'Mis avisos' }

// Menú de la cuenta → Mis avisos: Telegram de cada persona (lib/avisosTelegram.ts).
export default async function MisAvisosPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')
  if (!(await avisosHabilitados(session.user.organizacionId))) redirect('/')
  // 12-11 (rapidez): la primera carga viene en el HTML (mismo GET de la API).
  return <MisAvisosClient inicial={await deApi(avisosTelegram, '/api/avisos-telegram')} />
}
