import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { avisosHabilitados } from '@/lib/avisosTelegram'
import MisAvisosClient from '@/components/avisos/MisAvisosClient'

export const metadata = { title: 'Mis avisos' }

// Menú de la cuenta → Mis avisos: Telegram de cada persona (lib/avisosTelegram.ts).
export default async function MisAvisosPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')
  if (!(await avisosHabilitados(session.user.organizacionId))) redirect('/')
  return <MisAvisosClient />
}
