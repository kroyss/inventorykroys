import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import MiCuentaClient, { type Pestana } from '@/components/cuenta/MiCuentaClient'

export const metadata = { title: 'Mi cuenta' }

// Mi cuenta (13-11-2026, el dueño): Mis datos (todos) · Mi equipo y Mi negocio (administrador).
// Reemplaza a /usuarios (que ahora redirige a ?ver=equipo).
export default async function MiCuentaPage({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')
  const admin = session.user.role === 'admin'
  const { ver } = await searchParams
  const pestana: Pestana = admin && (ver === 'equipo' || ver === 'negocio') ? ver : 'datos'
  return <MiCuentaClient admin={admin} country={session.user.country} inicial={pestana} />
}
