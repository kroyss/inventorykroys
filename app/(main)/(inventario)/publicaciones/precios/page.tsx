import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import PublicacionesMLTabs, { pestanasML } from '@/components/productos/PublicacionesMLTabs'
import PrecioMLClient from '@/components/publicaciones/PrecioMLClient'
import { deApi } from '@/lib/inicial'
import { GET as precioVsML, type PrecioVsMLRespuesta } from '@/app/api/precio-vs-ml/route'

export const metadata = { title: 'Precio vs sistema' }

// Publicaciones → «Precio vs sistema» (22-11, módulo precio_vs_ml: por ahora solo SolucionesMC; lib/precioVsML.ts).
export default async function PrecioMLPage({ searchParams }: { searchParams: Promise<{ buscar?: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  const u = session.user
  if (!pestanasML(u).some(x => x.k === 'precios')) redirect(pestanasML(u)[0]?.href ?? '/productos')
  const [{ buscar }, inicial] = await Promise.all([searchParams, deApi<PrecioVsMLRespuesta>(precioVsML, '/api/precio-vs-ml', 2500)])
  return <>
    <PublicacionesMLTabs user={u} actual="precios" />
    <PrecioMLClient inicial={inicial} buscarInicial={buscar?.slice(0, 80) ?? ''} />
  </>
}
