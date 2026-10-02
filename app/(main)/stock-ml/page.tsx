import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { tieneModulo } from '@/lib/modulos'
import StockMLClient from '@/components/preguntas/StockMLClient'

export const metadata = { title: 'Stock en ML' }

// Automatizaciones → Stock en ML: stock real vs publicado en cada cuenta. Módulo propio `stock_ml`
// (en pruebas) sobre las conexiones de ML del módulo `preguntas`.
export default async function StockMLPage() {
  const session = await getServerSession(authOptions)
  if (!tieneModulo(session?.user, 'preguntas') || !tieneModulo(session?.user, 'stock_ml')) redirect('/automatizaciones')
  return <StockMLClient />
}
