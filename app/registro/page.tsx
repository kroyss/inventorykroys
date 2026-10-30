import { connection } from 'next/server'
import { marca } from '@/lib/marca'
import RegistroForm from '@/components/login/RegistroForm'

export const metadata = { title: 'Prueba gratis 15 días' }

// Autoregistro público (26-10, migración 125; lib/registro.ts): crea la cuenta al instante en prueba de 15 días.
// Sin login (proxy.ts: "registro$"). Mismo formato que la entrada (components/login/LoginForm.tsx).
// ?para=radar (29-10, migración 133): el mismo formulario desde el Radar, cuenta solo con el Radar.
export default async function RegistroPage({ searchParams }: { searchParams: Promise<{ para?: string }> }) {
  await connection()   // la marca es del contenedor (tiempo de ejecución), no del build
  const { para } = await searchParams
  return <RegistroForm marca={marca()} radar={para === 'radar'} />
}
