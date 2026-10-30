import { connection } from 'next/server'
import { redirect } from 'next/navigation'
import { marca } from '@/lib/marca'
import { RADAR_URL } from '@/lib/cuenta'
import RegistroForm from '@/components/login/RegistroForm'

export const metadata = { title: 'Prueba gratis 15 días' }

// Autoregistro público (26-10, migración 125; lib/registro.ts): crea la cuenta al instante en prueba de 15 días.
// Sin login (proxy.ts: "registro$"). Mismo formato que la entrada (components/login/LoginForm.tsx).
// El registro del Radar vive en el Radar (30-10: radar.elcomerciantedigital.com/registro, que envía a /api/registro
// con para=radar); la dirección vieja ?para=radar lleva allá.
export default async function RegistroPage({ searchParams }: { searchParams: Promise<{ para?: string }> }) {
  await connection()   // la marca es del contenedor (tiempo de ejecución), no del build
  if ((await searchParams).para === 'radar') redirect(`${RADAR_URL}/registro`)
  return <RegistroForm marca={marca()} />
}
