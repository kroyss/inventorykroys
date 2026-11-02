import Link from 'next/link'
import Renovar from '@/components/plan/Renovar'

export const metadata = { title: 'Mi plan' }

// Pública (proxy.ts): la cuenta vencida no puede iniciar sesión y paga desde aquí (lib/cobros.ts).
export default function RenovarPage() {
  return (
    <main className="min-h-screen bg-neutral-50 px-4 py-8">
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="flex items-baseline justify-between">
          <h1 className="text-xl font-semibold text-neutral-900">Mi plan</h1>
          <Link href="/login" className="text-sm text-sky-700 hover:underline">Ir a entrar</Link>
        </div>
        <Renovar />
      </div>
    </main>
  )
}
