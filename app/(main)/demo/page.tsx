import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { esDemo } from '@/lib/demo'
import { dbDeSesion } from '@/lib/session'
import DemoClient from '@/components/demo/DemoClient'

export const metadata = { title: 'Demo' }

// Solo existe en una empresa de demostración (lib/demo.ts).
export default async function DemoPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.empresaId || !(await esDemo(dbDeSesion(session)))) redirect('/')
  return <DemoClient />
}
