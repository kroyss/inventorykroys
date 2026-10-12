import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { tieneModulo } from '@/lib/modulos'
import { puede } from '@/lib/permisos'
import ImportarMLClient from '@/components/productos/ImportarMLClient'

export const metadata = { title: 'Importar desde MercadoLibre' }

export default async function ImportarMLPage() {
  const session = await getServerSession(authOptions)
  if (!session || !puede(session.user, 'ver_productos') || !puede(session.user, 'importar_ml')) redirect('/dashboard')
  return <ImportarMLClient conCuentas={tieneModulo(session.user, 'preguntas')} />
}
