import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import TasasClient from '@/components/tasas/TasasClient'
import { tieneModulo } from '@/lib/modulos'
import { esDuenoPlataforma } from '@/lib/empresa'
import TasasCoClient from '@/components/tasas/TasasCoClient'

export const metadata = { title: 'Ajustes' }

export default async function TasasPage() {
  const session = await getServerSession(authOptions)
  const country = session?.user.country
  if (session?.user.role !== 'admin' || (country !== 'VE' && country !== 'CO')) {
    redirect('/dashboard')
  }
  const puedeTasas = esDuenoPlataforma(session.user)
  return country === 'CO'
    ? <TasasCoClient puedeTasas={puedeTasas} />
    : <TasasClient bonos={tieneModulo(session.user, 'bonos')} puedeTasas={puedeTasas} despachos={tieneModulo(session.user, 'despachos')} />
}
