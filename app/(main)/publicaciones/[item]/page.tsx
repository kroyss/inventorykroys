import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { tieneModulo } from '@/lib/modulos'
import { puede } from '@/lib/permisos'
import EditorPublicacion from '@/components/publicaciones/EditorPublicacion'

export const metadata = { title: 'Editar publicación' }

export default async function EditarPublicacionPage({ params }: { params: Promise<{ item: string }> }) {
  const session = await getServerSession(authOptions)
  const u = session?.user
  if (!tieneModulo(u, 'preguntas') || !tieneModulo(u, 'publicaciones') || !puede(u, 'editar_publicaciones')) redirect('/automatizaciones')
  const { item } = await params
  if (!/^M[A-Z]{2}\d{6,15}$/.test(item)) redirect('/publicaciones')
  return <EditorPublicacion itemId={item} />
}
