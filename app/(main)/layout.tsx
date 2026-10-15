import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import Navbar from '@/components/layout/Navbar'
import BottomNav from '@/components/layout/BottomNav'
import CommandPalette from '@/components/layout/CommandPalette'
import { ES_STAGING } from '@/lib/entorno'
import { AvisosProvider } from '@/components/layout/Avisos'
import AvisoCuenta from '@/components/layout/AvisoCuenta'
import BienvenidaVideo from '@/components/aprendizaje/BienvenidaVideo'
import AvisoDisco from '@/components/layout/AvisoDisco'
import VerComoBarra from '@/components/layout/VerComoBarra'
import { esDuenoPlataforma } from '@/lib/empresa'

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  // Sesión descartada (usuario desactivado / contraseña cambiada, ver lib/auth.ts):
  // la cookie todavía pasa el middleware, así que se corta aquí.
  if (!session?.user) {
    // Volver a la misma sección después de entrar (la ruta la pone proxy.ts en x-ruta).
    const ruta = (await headers()).get('x-ruta')
    redirect(ruta && ruta.startsWith('/') && !ruta.startsWith('//') && ruta !== '/' ? `/login?callbackUrl=${encodeURIComponent(ruta)}` : '/login')
  }
  const role    = session?.user.role    ?? 'user'
  const country = session?.user.country ?? 'VE'
  const modulos = session?.user.modulos ?? []

  return (
    <AvisosProvider>
    <div className="min-h-screen bg-neutral-50">
      {ES_STAGING && (
        <div className="bg-amber-400 text-amber-950 text-center text-xs font-semibold py-1">
          COPIA DE PRUEBAS (staging) · los cambios aquí no afectan el sistema real · Reportador desactivado
        </div>
      )}
      {session.user.verComo && <VerComoBarra nombre={session.user.verComo.nombre} />}
      <Navbar />
      {esDuenoPlataforma(session.user) && <AvisoDisco />}
      <AvisoCuenta organizacionId={session.user.organizacionId} esAdmin={role === 'admin'} />
      <main className="max-w-7xl mx-auto px-4 py-6">
        {children}
      </main>
      <footer className="max-w-7xl mx-auto px-4 pt-2 pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-6 text-center text-xs text-neutral-400">
        © {new Date().getFullYear()} El Comerciante Digital · Todos los derechos reservados
      </footer>
      {/* El primer video de Aprendizaje se abre solo hasta completarlo (no a la organización de la plataforma: lo decide la API). */}
      <BienvenidaVideo />
      <BottomNav role={role} permisos={session.user.permisos} country={country} modulos={modulos} />
      <CommandPalette role={role} permisos={session.user.permisos} country={country} modulos={modulos} />
    </div>
    </AvisosProvider>
  )
}
