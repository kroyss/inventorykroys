import AprendizajeClient from '@/components/aprendizaje/AprendizajeClient'

export const metadata = { title: 'Aprendizaje' }

// Aprendizaje: videos en orden dentro del sistema (lib/aprendizaje.ts). Para todos los usuarios.
export default function AprendizajePage() {
  return <AprendizajeClient />
}
