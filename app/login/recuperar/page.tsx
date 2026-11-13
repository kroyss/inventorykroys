import RecuperarClave from '@/components/login/RecuperarClave'

// Pública (proxy.ts deja pasar todo lo que empieza con /login). 13-11-2026, mig. 175.
export const metadata = { title: 'Recuperar clave' }

export default function RecuperarPage() {
  return <RecuperarClave />
}
