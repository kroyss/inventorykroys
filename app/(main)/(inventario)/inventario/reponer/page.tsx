import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import InventarioTabs, { puedeReponer } from '@/components/inventario/InventarioTabs'
import ReponerClient from '@/components/inventario/ReponerClient'
import type { StockSub } from '@/components/reportes/StockReport'
import { deApi } from '@/lib/inicial'
import { GET as analisis } from '@/app/api/reports/stock-analysis/route'

export const metadata = { title: 'Reponer' }

const SUBS: StockSub[] = ['reposicion', 'remate', 'nuevos', 'declive']

// Inventario → Reponer (18-11): lo que era Reportes → Stock (los enlaces viejos ?tab=stock&sub=… llegan aquí).
export default async function ReponerPage({ searchParams }: { searchParams: Promise<{ sub?: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session || !puedeReponer(session.user)) redirect('/inventario')
  const [{ sub }, inicial] = await Promise.all([searchParams, deApi(analisis, '/api/reports/stock-analysis', 2500)])
  const s = sub?.toLowerCase() as StockSub
  return <>
    <InventarioTabs user={session.user} actual="reponer" />
    <ReponerClient inicial={inicial} subInicial={SUBS.includes(s) ? s : 'reposicion'} />
  </>
}
