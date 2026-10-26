import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { puede } from '@/lib/permisos'
import { tieneModulo } from '@/lib/modulos'
import { ORGANIZACION_PLATAFORMA } from '@/lib/empresa'
import VincularMLClient from '@/components/productos/VincularMLClient'
import PublicacionesMLTabs, { pestanasML } from '@/components/productos/PublicacionesMLTabs'

export const metadata = { title: 'Vincular con MercadoLibre' }

// Vincular publicaciones de ML (20-10, migración 109): los empleados entran por su menú ("Vincular ML", permiso
// vincular_ml, sin ver Productos); el dueño, desde Productos → "Vincular con ML".
export default async function VincularMLPage({ searchParams }: { searchParams: Promise<{ buscar?: string; vista?: string }> }) {
  const session = await getServerSession(authOptions)
  // También quien ya tenía "Importar desde ML" (el botón de Productos lleva aquí).
  if (!session || !(puede(session.user, 'vincular_ml') || (puede(session.user, 'ver_productos') && puede(session.user, 'importar_ml')))) redirect('/dashboard')
  // "No sé, para Marcos" es de SolucionesMC; en un cliente la duda queda para su administrador (25-10).
  const paraQuien = session.user.organizacionId === ORGANIZACION_PLATAFORMA ? 'Marcos' : 'el administrador'
  const { buscar, vista } = await searchParams
  return <>
    <PublicacionesMLTabs user={session.user} actual="vincular" />
    <VincularMLClient conCuentas={tieneModulo(session.user, 'preguntas')} paraQuien={paraQuien}
      buscarInicial={buscar?.slice(0, 80) ?? ''} vistaInicial={vista === 'activas' ? 'activas' : undefined} conStock={pestanasML(session.user).some(x => x.k === 'stock')} />
  </>
}
