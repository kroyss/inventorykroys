import { Suspense } from 'react'
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
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
  const editar = tipos.includes('descripcion')
  return (
    <div>
      <PublicacionesMLTabs user={u} actual={editar ? 'editar' : 'promociones'} />
      <Link href={editar ? '/publicaciones' : '/productos/promociones'} className="btn-ghost !px-2 !py-1 text-xs">← {editar ? 'Publicaciones' : 'Promociones'}</Link>
      <PageHeader title="Tareas en MercadoLibre" subtitle="Lo que el sistema está mandando (o mandó) a MercadoLibre en segundo plano: promociones, encabezados, pies y precios" />
      <Suspense><LotesClient /></Suspense>
    </div>
  )
}
