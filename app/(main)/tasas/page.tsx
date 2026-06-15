import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import TasasClient from '@/components/tasas/TasasClient'

export const metadata = { title: 'Tasas — Syncsora Inventory' }

export default async function TasasPage() {
  const session = await getServerSession(authOptions)
  if (session?.user.role !== 'admin' || session.user.country !== 'VE') {
    redirect('/dashboard')
  }
  return <TasasClient />
}
