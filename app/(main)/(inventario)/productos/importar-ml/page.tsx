import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { tieneModulo } from '@/lib/modulos'
import { puede } from '@/lib/permisos'
import ImportarMLClient from '@/components/productos/ImportarMLClient'

export const metadata = { title: 'Importar desde MercadoLibre' }

export default async function ImportarMLPage({ searchParams }: { searchParams: Promise<{ buscar?: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session || !puede(session.user, 'ver_productos') || !puede(session.user, 'importar_ml')) redirect('/dashboard')
  const { buscar } = await searchParams
  // 13-11: desde Vincular («Crear producto nuevo») llega ?buscar=MLV…: se abre con esa publicación.
  return <ImportarMLClient conCuentas={tieneModulo(session.user, 'preguntas')} buscarInicial={buscar?.slice(0, 80) ?? ''} />
}
