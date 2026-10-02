import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { tieneModulo } from '@/lib/modulos'
import AlertasStockClient from '@/components/preguntas/AlertasStockClient'

export const metadata = { title: 'Alertas de stock' }

// Automatizaciones → Alertas de stock (lib/alertasStock.ts). Para todas las empresas con cuentas de ML.
export default async function AlertasStockPage() {
  const session = await getServerSession(authOptions)
  if (!tieneModulo(session?.user, 'preguntas')) redirect('/automatizaciones')
  return <AlertasStockClient />
}
