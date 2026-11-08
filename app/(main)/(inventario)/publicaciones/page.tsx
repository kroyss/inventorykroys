import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { tieneModulo } from '@/lib/modulos'
import { puede } from '@/lib/permisos'
import { sinCuentasML } from '@/lib/preguntasSesion'
import { PageHeader } from '@/components/ui'
import SinCuentaML from '@/components/automatizaciones/SinCuentaML'
import PublicacionesClient from '@/components/publicaciones/PublicacionesClient'
import PublicacionesMLTabs, { pestanasML } from '@/components/productos/PublicacionesMLTabs'

export const metadata = { title: 'Publicaciones' }

// Inventario → Publicaciones (menú propio desde 08-11): pestañas Editar · Vincular · Stock · Promociones.
// Esta dirección es la pestaña Editar (módulo `publicaciones`, mig. 151); quien no la tiene va a la primera que sí ve.
export default async function PublicacionesPage() {
  const session = await getServerSession(authOptions)
  const u = session!.user
  if (!tieneModulo(u, 'preguntas') || !tieneModulo(u, 'publicaciones') || !puede(u, 'editar_publicaciones')) {
    redirect(pestanasML(u)[0]?.href ?? '/productos')
  }
  if (await sinCuentasML(session!)) {
    return <SinCuentaML esAdmin={puede(u, 'ml_cuentas')} titulo="Publicaciones" gancho="Edita tus publicaciones de MercadoLibre sin entrar a ML."
      beneficios={['Precio, stock, fotos, características y descripción en una sola pantalla.',
        'Antes de guardar ves qué cambia: antes → después.',
        'Cada cambio queda anotado.']} />
  }
  return (
    <div>
      <PublicacionesMLTabs user={u} actual="editar" />
      <PageHeader title="Editar publicaciones" subtitle="Precio, stock, fotos, características, variantes y descripción de tus publicaciones de MercadoLibre" />
      <PublicacionesClient />
    </div>
  )
}
