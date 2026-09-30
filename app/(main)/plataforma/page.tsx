import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { esDuenoPlataforma } from '@/lib/empresa'
import PlataformaClient from '@/components/plataforma/PlataformaClient'

export const metadata = { title: 'Plataforma — Syncsora Inventory' }

export default async function PlataformaPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !esDuenoPlataforma(session.user)) redirect('/dashboard')
  return <PlataformaClient empresaActual={session.user.empresaId} />
}
