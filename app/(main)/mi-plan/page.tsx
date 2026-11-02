import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { ORGANIZACION_PLATAFORMA } from '@/lib/empresa'
import MiPlan from '@/components/plan/MiPlan'

export const metadata = { title: 'Mi plan' }

// Menú de la cuenta → Mi plan (mig. 141): solo el admin de una organización cliente (la propietaria no paga plan).
export default async function MiPlanPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')
  if (session.user.role !== 'admin' || session.user.organizacionId === ORGANIZACION_PLATAFORMA) redirect('/')
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-neutral-900">Mi plan</h1>
      <MiPlan />
    </div>
  )
}
