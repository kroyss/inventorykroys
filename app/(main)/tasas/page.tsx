import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import TasasClient from '@/components/tasas/TasasClient'
import TasasCoClient from '@/components/tasas/TasasCoClient'

export const metadata = { title: 'Tasas — Syncsora Inventory' }

export default async function TasasPage() {
  const session = await getServerSession(authOptions)
  const country = session?.user.country
  if (session?.user.role !== 'admin' || (country !== 'VE' && country !== 'CO')) {
    redirect('/dashboard')
  }
  return country === 'CO' ? <TasasCoClient /> : <TasasClient />
}
