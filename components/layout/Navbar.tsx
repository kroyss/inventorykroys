import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import SignOutButton from './SignOutButton'
import CountrySwitcher from './CountrySwitcher'
import NavLinks from './NavLinks'
import type { Country } from '@/lib/types'

export default async function Navbar() {
  const session = await getServerSession(authOptions)
  const role    = session?.user.role    ?? 'user'
  const country = session?.user.country ?? 'VE'

  return (
    <nav className="bg-white border-b border-neutral-200 sticky top-0 z-10 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-6">

        <div className="flex items-center gap-2 mr-2 shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.jpg?v=2" alt="Syncsora Inventory" className="h-9 w-auto" />
          <span className="text-[11px] font-semibold text-neutral-500 border border-neutral-200 rounded px-1.5 py-0.5">{country}</span>
        </div>

        <NavLinks role={role} country={country} />

        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs text-neutral-400 hidden sm:block">{session?.user?.name}</span>
          {role === 'admin' && <CountrySwitcher current={country as Country} />}
          <SignOutButton />
        </div>

      </div>
    </nav>
  )
}
