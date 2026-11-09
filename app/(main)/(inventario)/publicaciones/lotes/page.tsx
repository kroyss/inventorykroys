import { Suspense } from 'react'
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { PageHeader } from '@/components/ui'
import LotesClient from '@/components/publicaciones/LotesClient'
import PublicacionesMLTabs, { pestanasML } from '@/components/productos/PublicacionesMLTabs'
import { tiposPermitidos } from '@/lib/colaPermisos'

export const metadata = { title: 'Tareas en MercadoLibre' }

// Publicaciones → Tareas en MercadoLibre (antes «Cambios en lote», 08-11): todo lo que el sistema manda a ML en segundo
// plano (cola, lib/colaML.ts): encabezados/pies, precios y promociones. Cada usuario ve las de sus secciones.
export default async function TareasPage() {
  const session = await getServerSession(authOptions)
  const u = session!.user
  const tipos = tiposPermitidos(u)
  if (!tipos.length) redirect(pestanasML(u)[0]?.href ?? '/productos')
  return (
    <div>
      <PublicacionesMLTabs user={u} actual="tareas" />
      <PageHeader title="Tareas en MercadoLibre" subtitle="Lo que el sistema está mandando (o mandó) a MercadoLibre en segundo plano: promociones, encabezados, pies y precios" />
      <Suspense><LotesClient /></Suspense>
    </div>
  )
}
