import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { esDemoEmpresa } from '@/lib/demo'
import DemoClient from '@/components/demo/DemoClient'

export const metadata = { title: 'Demo' }

// Solo existe en una empresa de demostración (lib/demo.ts).
export default async function DemoPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.empresaId || !(await esDemoEmpresa(session.user.empresaId, session.user.country))) redirect('/')
  return <DemoClient />
}
