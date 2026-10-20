import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { puede } from '@/lib/permisos'
import { tieneModulo } from '@/lib/modulos'
import VincularMLClient from '@/components/productos/VincularMLClient'

export const metadata = { title: 'Vincular con MercadoLibre' }

// Vincular publicaciones de ML (20-10, migración 109): los empleados entran por su menú ("Vincular ML", permiso
// vincular_ml, sin ver Productos); el dueño, desde Productos → "Vincular con ML".
export default async function VincularMLPage() {
  const session = await getServerSession(authOptions)
  if (!session || !puede(session.user, 'vincular_ml')) redirect('/dashboard')
  return <VincularMLClient conCuentas={tieneModulo(session.user, 'preguntas')} />
}
