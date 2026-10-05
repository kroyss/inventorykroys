import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { tieneModulo } from '@/lib/modulos'
import AlertasStockClient from '@/components/preguntas/AlertasStockClient'
import SinCuentaML from '@/components/automatizaciones/SinCuentaML'
import { sinCuentasML } from '@/lib/preguntasSesion'

export const metadata = { title: 'Stock' }

// Automatizaciones → Stock (lib/alertasStock.ts). Módulo `alertas_stock` (necesita cuentas de ML: `preguntas`).
export default async function AlertasStockPage() {
  const session = await getServerSession(authOptions)
  if (!tieneModulo(session?.user, 'preguntas') || !tieneModulo(session?.user, 'alertas_stock')) redirect('/automatizaciones')
  if (await sinCuentasML(session!)) {
    return <SinCuentaML esAdmin={session!.user.role === 'admin'} titulo="Stock" gancho="Entérate de lo que vendes y se te está agotando, antes de perder ventas."
      beneficios={['Tus publicaciones (y cada variante: color, talla…) agotadas o por agotarse.',
        'Solo lo que se vendió en los últimos 30 días: lo urgente de reponer.',
        'Se revisa solo cada 2 horas, con el link a cada publicación.']} />
  }
  return <AlertasStockClient />
}
