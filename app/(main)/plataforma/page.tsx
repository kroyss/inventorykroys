import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { esDuenoPlataforma } from '@/lib/empresa'
import PlataformaClient from '@/components/plataforma/PlataformaClient'
import { deApi } from '@/lib/inicial'
import { GET as empresas } from '@/app/api/plataforma/empresas/route'
import { GET as aprendizaje } from '@/app/api/plataforma/aprendizaje/route'
import { GET as fundadores } from '@/app/api/plataforma/fundadores/route'
import { GET as cobros } from '@/app/api/plataforma/cobros/route'
import { GET as visitas } from '@/app/api/plataforma/visitas/route'

export const metadata = { title: 'Plataforma' }

export default async function PlataformaPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !esDuenoPlataforma(session.user)) redirect('/dashboard')
  // 12-11 (rapidez): empresas y el resumen de Hoy vienen en el HTML (mismos GET de la API).
  const [e, a, f, c, v] = await Promise.all([empresas, aprendizaje, fundadores, cobros, visitas].map((get, i) =>
    deApi(() => get(), ['/api/plataforma/empresas', '/api/plataforma/aprendizaje', '/api/plataforma/fundadores', '/api/plataforma/cobros', '/api/plataforma/visitas'][i])))
  return <PlataformaClient empresaActual={session.user.empresaId}
    inicial={{ empresas: e, resumen: { aprendizaje: a, fundadores: f, cobros: c, visitas: v } }} />
}
