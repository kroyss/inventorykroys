import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { puede } from '@/lib/permisos'
import { tieneModulo } from '@/lib/modulos'
import StockMLClient from '@/components/inventario/StockMLClient'
import PublicacionesMLTabs, { pestanasML } from '@/components/productos/PublicacionesMLTabs'
import { deApi } from '@/lib/inicial'
import { GET as stockEnML } from '@/app/api/stock-en-ml/route'
import type { StockMLRespuesta } from '@/components/inventario/StockMLClient'

export const metadata = { title: 'Stock en MercadoLibre' }

// Stock en ML, Fase 1 (26-10): Inventario → «Stock en ML». Hace falta inventario y cuentas de ML (módulo preguntas).
export default async function StockMLPage({ searchParams }: { searchParams: Promise<{ buscar?: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session || !puede(session.user, 'ver_inventario') || !tieneModulo(session.user, 'preguntas')) redirect('/inventario')
  // 12-11 (rapidez): la lista viene en el HTML (mismo GET de la API).
  const [{ buscar }, inicial] = await Promise.all([searchParams, deApi<StockMLRespuesta>(stockEnML, '/api/stock-en-ml', 2500)])
  return <>
    <PublicacionesMLTabs user={session.user} actual="stock" />
    <StockMLClient buscarInicial={buscar?.slice(0, 80) ?? ''} conVincular={pestanasML(session.user).some(x => x.k === 'vincular')} inicial={inicial} />
  </>
}
