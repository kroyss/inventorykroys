import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { tieneModulo } from '@/lib/modulos'
import { puede } from '@/lib/permisos'
import { sinCuentasML } from '@/lib/preguntasSesion'
import { PageHeader } from '@/components/ui'
import SinCuentaML from '@/components/automatizaciones/SinCuentaML'
import PublicacionesClient from '@/components/publicaciones/PublicacionesClient'

export const metadata = { title: 'Publicaciones' }

// Automatizaciones → Publicaciones (Fase 6, mig. 151): editar las publicaciones de ML desde el sistema.
export default async function PublicacionesPage() {
  const session = await getServerSession(authOptions)
  const u = session?.user
  if (!tieneModulo(u, 'preguntas') || !tieneModulo(u, 'publicaciones') || !puede(u, 'editar_publicaciones')) redirect('/automatizaciones')
  if (await sinCuentasML(session!)) {
    return <SinCuentaML esAdmin={puede(u, 'ml_cuentas')} titulo="Publicaciones" gancho="Edita tus publicaciones de MercadoLibre sin entrar a ML."
      beneficios={['Precio, stock, fotos, características y descripción en una sola pantalla.',
        'Antes de guardar ves qué cambia: antes → después.',
        'Cada cambio queda anotado.']} />
  }
  return (
    <div>
      <PageHeader title="Publicaciones" subtitle="Edita tus publicaciones de MercadoLibre: precio, stock, fotos, características, variantes y descripción" />
      <PublicacionesClient />
    </div>
  )
}
