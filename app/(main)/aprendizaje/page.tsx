import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { tieneModulo } from '@/lib/modulos'
import AprendizajeClient from '@/components/aprendizaje/AprendizajeClient'

export const metadata = { title: 'Aprendizaje' }

// Aprendizaje: manuales (14-11, Inventario) y videos en orden dentro del sistema (lib/aprendizaje.ts). Para todos.
export default async function AprendizajePage() {
  const session = await getServerSession(authOptions)
  return <AprendizajeClient manualInventario={!!session && tieneModulo(session.user, 'inventario')} />
}
