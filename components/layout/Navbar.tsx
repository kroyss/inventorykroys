import Link from 'next/link'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import SignOutButton from './SignOutButton'
import CountrySwitcher from './CountrySwitcher'
import NavLinks from './NavLinks'
import { empresasDeUsuario, esDuenoPlataforma } from '@/lib/empresa'

export default async function Navbar() {
  const session = await getServerSession(authOptions)
  const role    = session?.user.role    ?? 'user'
  const country = session?.user.country ?? 'VE'
  const empresas = session?.user.id ? await empresasDeUsuario(session.user.id) : []

  return (
    <nav className="bg-white border-b border-neutral-200 sticky top-0 z-10 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-6">

        <div className="flex items-center gap-2 mr-2 shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.jpg?v=2" alt="Syncsora Inventory" className="h-9 w-auto" />
          <span className="text-[11px] font-semibold text-neutral-500 border border-neutral-200 rounded px-1.5 py-0.5">{country}</span>
        </div>

        <NavLinks role={role} country={country} modulos={session?.user.modulos ?? []} />

        <div className="flex items-center gap-3 shrink-0 ml-auto">
          <span className="text-xs text-neutral-400 hidden sm:block">{session?.user?.name}</span>
          {session?.user && esDuenoPlataforma(session.user) && (
            <Link href="/plataforma" className="text-sm text-neutral-500 hover:text-neutral-900 transition-colors hidden md:block">
              Plataforma
            </Link>
          )}
          {role === 'admin' && (
            <Link href="/usuarios" className="text-sm text-neutral-500 hover:text-neutral-900 transition-colors hidden md:block">
              Usuarios
            </Link>
          )}
          {session?.user.empresaId && (
            <CountrySwitcher actual={session.user.empresaId}
              empresas={empresas.map(e => ({ id: e.id, nombre: e.nombre, country: e.country }))} />
          )}
          <SignOutButton />
        </div>

      </div>
    </nav>
  )
}
