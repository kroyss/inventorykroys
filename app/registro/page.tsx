import { connection } from 'next/server'
import { marca } from '@/lib/marca'
import RegistroForm from '@/components/login/RegistroForm'

export const metadata = { title: 'Prueba gratis 15 días' }

// Autoregistro público (26-10, migración 125; lib/registro.ts): crea la cuenta al instante en prueba de 15 días.
// Sin login (proxy.ts: "registro$"). Mismo formato que la entrada (components/login/LoginForm.tsx).
export default async function RegistroPage() {
  await connection()   // la marca es del contenedor (tiempo de ejecución), no del build
  return <RegistroForm marca={marca()} />
}
