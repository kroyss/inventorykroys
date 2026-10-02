import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import UserMenu from './UserMenu'
import CountrySwitcher from './CountrySwitcher'
import NavLinks from './NavLinks'
import AprendizajeNav from './AprendizajeNav'
import EspacioSwitcher from './EspacioSwitcher'
import { MODULOS_AUTOMATIZACIONES, radarUrl } from '@/lib/espacios'
import { dbGlobal } from '@/lib/db'
import { empresasDeUsuario, esDuenoPlataforma } from '@/lib/empresa'

export default async function Navbar() {
  const session = await getServerSession(authOptions)
  const role    = session?.user.role    ?? 'user'
  const country = session?.user.country ?? 'VE'
  const empresas = session?.user.id ? await empresasDeUsuario(session.user.id) : []
  // Espacios: Automatizaciones si la empresa tiene alguno de sus módulos; Radar si la
  // cuenta tiene ese producto (users.productos).
  const modulos = session?.user.modulos ?? []
  const conAutomatizaciones = MODULOS_AUTOMATIZACIONES.some(m => modulos.includes(m))
  const { rows: [cuenta] } = session?.user.id
    ? await dbGlobal().query(`SELECT productos FROM users WHERE id = $1`, [session.user.id])
    : { rows: [] as { productos: string[] }[] }
  const conRadar = !!cuenta?.productos?.includes('radar')

  return (
    <nav className="bg-white border-b border-neutral-200 sticky top-0 z-10 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-4">

        <EspacioSwitcher automatizaciones={conAutomatizaciones} radarUrl={conRadar ? radarUrl() : null} />

        <NavLinks role={role} country={country} modulos={session?.user.modulos ?? []} />

        <div className="flex items-center gap-3 shrink-0 ml-auto">
          <AprendizajeNav />
          {session?.user.empresaId && (
            <CountrySwitcher actual={session.user.empresaId}
              empresas={empresas.map(e => ({ id: e.id, nombre: e.nombre, country: e.country }))} />
          )}
          {session?.user && (
            <UserMenu nombre={session.user.name ?? 'Cuenta'} rol={role} empresa={session.user.empresaNombre ?? null}
              ajustes={role === 'admin'} usuarios={role === 'admin'} plataforma={esDuenoPlataforma(session.user)} />
          )}
        </div>

      </div>
    </nav>
  )
}
