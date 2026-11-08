import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { authOptions } from '@/lib/auth'
import { tieneModulo } from '@/lib/modulos'
import { puede } from '@/lib/permisos'
import { PageHeader } from '@/components/ui'
import TextosClient from '@/components/publicaciones/TextosClient'
import PublicacionesMLTabs, { pestanasML } from '@/components/productos/PublicacionesMLTabs'

export const metadata = { title: 'Textos de descripción' }

// Publicaciones → Textos de descripción (mig 152): encabezados y pies guardados.
export default async function TextosPage() {
  const session = await getServerSession(authOptions)
  const u = session!.user
  if (!tieneModulo(u, 'preguntas') || !tieneModulo(u, 'publicaciones') || !puede(u, 'editar_publicaciones')) redirect(pestanasML(u)[0]?.href ?? '/productos')
  return (
    <div>
      <PublicacionesMLTabs user={u} actual="editar" />
      <Link href="/publicaciones" className="btn-ghost !px-2 !py-1 text-xs">← Publicaciones</Link>
      <PageHeader title="Textos de descripción" subtitle="Encabezados y pies que se repiten en tus descripciones: cámbialos una vez y se actualizan en todas" />
      <TextosClient />
    </div>
  )
}
