import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Navbar from '@/components/layout/Navbar'
import BottomNav from '@/components/layout/BottomNav'
import CommandPalette from '@/components/layout/CommandPalette'

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  // Sesión descartada (usuario desactivado / contraseña cambiada, ver lib/auth.ts):
  // la cookie todavía pasa el middleware, así que se corta aquí.
  if (!session?.user) redirect('/login')
  const role    = session?.user.role    ?? 'user'
  const country = session?.user.country ?? 'VE'

  return (
    <div className="min-h-screen bg-neutral-50">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 py-6 pb-24 md:pb-6">
        {children}
      </main>
      <BottomNav role={role} country={country} />
      <CommandPalette role={role} country={country} />
    </div>
  )
}
