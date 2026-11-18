import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { tieneModulo } from '@/lib/modulos'
import AlertasStockClient from '@/components/preguntas/AlertasStockClient'
import SinCuentaML from '@/components/automatizaciones/SinCuentaML'
import { sinCuentasML } from '@/lib/preguntasSesion'
import { puede } from '@/lib/permisos'
import { pestanasML } from '@/components/productos/PublicacionesMLTabs'
import { deApi } from '@/lib/inicial'
import { GET as alertas } from '@/app/api/alertas-stock/route'
import type { Datos } from '@/components/preguntas/AlertasStockClient'

export const metadata = { title: 'Stock' }

// Automatizaciones → Stock (lib/alertasStock.ts). Módulo `alertas_stock` (necesita cuentas de ML: `preguntas`).
export default async function AlertasStockPage() {
  const session = await getServerSession(authOptions)
  if (!tieneModulo(session?.user, 'preguntas') || !tieneModulo(session?.user, 'alertas_stock') || !puede(session?.user, 'ver_stock')) redirect('/automatizaciones')
  if (await sinCuentasML(session!)) {
    return <SinCuentaML esAdmin={puede(session!.user, 'ml_cuentas')} titulo="Stock" gancho="Entérate de lo que vendes y se te está agotando, antes de perder ventas."
      beneficios={['Tus publicaciones (y cada variante: color, talla…) agotadas o por agotarse.',
        'Solo lo que se vendió en los últimos 30 días: lo urgente de reponer.',
        'Se revisa solo cada hora, con el link a cada publicación.']} />
  }
  // 18-11 (el dueño: «dos Stock confunden»): con Inventario, esta pantalla dice lo que informa ML; comparar con el
  // inventario y arreglar en un clic está en Publicaciones → Stock vs inventario. Solo un aviso: nada más cambia aquí.
  const conInventario = pestanasML(session!.user).some(x => x.k === 'stock')
  // 12-11 (rapidez): la pestaña Agotadas viene en el HTML (mismo GET de la API).
  return <AlertasStockClient inicial={await deApi<Datos>(alertas, '/api/alertas-stock?vista=agotadas')} conInventario={conInventario} />
}
