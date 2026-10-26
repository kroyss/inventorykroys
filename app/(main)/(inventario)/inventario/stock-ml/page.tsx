import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { puede } from '@/lib/permisos'
import { tieneModulo } from '@/lib/modulos'
import StockMLClient from '@/components/inventario/StockMLClient'
import PublicacionesMLTabs, { pestanasML } from '@/components/productos/PublicacionesMLTabs'

export const metadata = { title: 'Stock en MercadoLibre' }

// Stock en ML, Fase 1 (26-10): Inventario → «Stock en ML». Hace falta inventario y cuentas de ML (módulo preguntas).
export default async function StockMLPage({ searchParams }: { searchParams: Promise<{ buscar?: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session || !puede(session.user, 'ver_inventario') || !tieneModulo(session.user, 'preguntas')) redirect('/inventario')
  const { buscar } = await searchParams
  return <>
    <PublicacionesMLTabs user={session.user} actual="stock" />
    <StockMLClient buscarInicial={buscar?.slice(0, 80) ?? ''} conVincular={pestanasML(session.user).some(x => x.k === 'vincular')} />
  </>
}
