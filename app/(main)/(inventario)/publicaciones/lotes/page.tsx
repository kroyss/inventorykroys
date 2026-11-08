import { Suspense } from 'react'
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { authOptions } from '@/lib/auth'
import { tieneModulo } from '@/lib/modulos'
import { puede } from '@/lib/permisos'
import { PageHeader } from '@/components/ui'
import LotesClient from '@/components/publicaciones/LotesClient'
import PublicacionesMLTabs, { pestanasML } from '@/components/productos/PublicacionesMLTabs'

export const metadata = { title: 'Cambios en lote' }

// Publicaciones → Cambios en lote (mig 152): avance de precios / encabezados / pies mandados a varias publicaciones.
export default async function LotesPage() {
  const session = await getServerSession(authOptions)
  const u = session!.user
  if (!tieneModulo(u, 'preguntas') || !tieneModulo(u, 'publicaciones') || !puede(u, 'editar_publicaciones')) redirect(pestanasML(u)[0]?.href ?? '/productos')
  return (
    <div>
      <PublicacionesMLTabs user={u} actual="editar" />
      <Link href="/publicaciones" className="text-xs text-neutral-500 hover:text-neutral-800">← Publicaciones</Link>
      <PageHeader title="Cambios en lote" subtitle="Lo que se está mandando (o se mandó) a varias publicaciones a la vez" />
      <Suspense><LotesClient /></Suspense>
    </div>
  )
}
