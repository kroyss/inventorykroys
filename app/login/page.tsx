import { connection } from 'next/server'
import { marca } from '@/lib/marca'
import LoginForm from '@/components/login/LoginForm'

export const metadata = { title: 'Entrar' }

export default async function LoginPage() {
  await connection()   // la marca es del contenedor (tiempo de ejecución), no del build
  return <LoginForm marca={marca()} />
}
