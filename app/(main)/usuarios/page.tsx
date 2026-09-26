import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import UsuariosClient from '@/components/usuarios/UsuariosClient'

export const metadata = { title: 'Usuarios — Syncsora Inventory' }

export default async function UsuariosPage() {
  const session = await getServerSession(authOptions)
  if (session?.user.role !== 'admin') redirect('/dashboard')
  return <UsuariosClient country={session.user.country} />
}
