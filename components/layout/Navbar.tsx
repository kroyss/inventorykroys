import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import UserMenu from './UserMenu'
import { puede, listaPagosEnVentas } from '@/lib/permisos'
import CountrySwitcher from './CountrySwitcher'
import NavLinks from './NavLinks'
import AprendizajeNav from './AprendizajeNav'
import NovedadesNav from './NovedadesNav'
import AyudaNav from './AyudaNav'
import ActualizarCentral from './ActualizarCentral'
import { gruposDe } from '@/lib/actualizarGrupos'
import EspacioSwitcher from './EspacioSwitcher'
import { MODULOS_AUTOMATIZACIONES } from '@/lib/espacios'
import { dbGlobal } from '@/lib/db'
import { empresasDeUsuario, esDuenoPlataforma, ORGANIZACION_PLATAFORMA } from '@/lib/empresa'
import { esDemoEmpresa } from '@/lib/demo'
import { avisosHabilitados } from '@/lib/avisosTelegram'

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
  // Empresa de demostración: el menú de la cuenta lleva a /demo (restaurar cada sección).
  const demo = session?.user.empresaId ? await esDemoEmpresa(session.user.empresaId, session.user.country) : false
  // Mis avisos (Telegram): para la organización de la plataforma sin consultar; las demás, si Plataforma los abrió.
  const avisos = session?.user ? await avisosHabilitados(session.user.organizacionId).catch(() => false) : false

  return (
    <nav className="bg-white border-b border-neutral-200 sticky top-0 z-10 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-2 xl:gap-4">

        <EspacioSwitcher automatizaciones={conAutomatizaciones} inventario={modulos.includes('inventario')} modulos={modulos} />

        <NavLinks role={role} permisos={session?.user.permisos ?? []} country={country} modulos={session?.user.modulos ?? []} />

        <div className="flex items-center gap-2 xl:gap-3 shrink-0 ml-auto">
          {/* 18-11: central de actualización (también en el teléfono): reemplaza los botones de traer de cada pantalla. */}
          <ActualizarCentral grupos={gruposDe(session?.user)} />
          <AprendizajeNav />
          <AyudaNav />
          <NovedadesNav />
          {session?.user.empresaId && !session.user.soporte && (
            <CountrySwitcher actual={session.user.empresaId}
              empresas={empresas.map(e => ({ id: e.id, nombre: e.nombre, country: e.country }))} />
          )}
          {session?.user && (
            <UserMenu nombre={session.user.name ?? 'Cuenta'} rol={role} empresa={session.user.empresaNombre ?? null}
              ajustes={role === 'admin' && modulos.includes('inventario')} usuarios={role === 'admin'}
              pagosME={modulos.includes('pagos_me') && session.user.country === 'VE' && puede(session.user, 'ver_pagos_me') && listaPagosEnVentas(session.user)} plataforma={esDuenoPlataforma(session.user)} demo={demo} avisos={avisos}
              miPlan={role === 'admin' && !!session.user.organizacionId && session.user.organizacionId !== ORGANIZACION_PLATAFORMA}
              miIA={modulos.includes('mi_ia') && modulos.includes('preguntas') && puede(session.user, 'automatizaciones_config')} radar={conRadar} />
          )}
        </div>

      </div>
    </nav>
  )
}
