import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { tieneModulo } from '@/lib/modulos'
import AlertasStockClient from '@/components/preguntas/AlertasStockClient'

export const metadata = { title: 'Stock' }

// Automatizaciones → Stock (lib/alertasStock.ts). Módulo `alertas_stock` (necesita cuentas de ML: `preguntas`).
export default async function AlertasStockPage() {
  const session = await getServerSession(authOptions)
  if (!tieneModulo(session?.user, 'preguntas') || !tieneModulo(session?.user, 'alertas_stock')) redirect('/automatizaciones')
  return <AlertasStockClient />
}
