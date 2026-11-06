import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { tieneModulo } from '@/lib/modulos'
import { puede } from '@/lib/permisos'
import MiIA from '@/components/miia/MiIA'

export const metadata = { title: 'Mi IA' }

// Menú de la cuenta → Mi IA (06-11, lib/miIA.ts): la misma que en Preguntas → Configuración y en Mensajes.
export default async function MiIAPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')
  if (!tieneModulo(session.user, 'mi_ia') || !tieneModulo(session.user, 'preguntas') || !puede(session.user, 'automatizaciones_config')) redirect('/')
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-neutral-900">Mi IA</h1>
      <MiIA />
    </div>
  )
}
