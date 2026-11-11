import Link from '@/components/ui/Link'
import Renovar from '@/components/plan/Renovar'
import { RADAR_URL } from '@/lib/cuenta'

export const metadata = { title: 'Mi plan' }

// Pública (proxy.ts): la cuenta vencida no puede iniciar sesión y paga desde aquí (lib/cobros.ts).
// 09-11 (mig. 159): también la usa el Radar (?de=radar&u=usuario): quien se registró en el Radar paga aquí su mes.
export default async function RenovarPage({ searchParams }: { searchParams: Promise<{ de?: string; u?: string }> }) {
  const { de, u } = await searchParams
  const radar = de === 'radar'
  const usuario = typeof u === 'string' && /^[a-z0-9._-]{3,30}$/i.test(u) ? u : undefined
  return (
    <main className="min-h-screen bg-neutral-50 px-4 py-8">
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="flex items-baseline justify-between">
          <h1 className="text-xl font-semibold text-neutral-900">{radar ? 'Activa tu Radar' : 'Mi plan'}</h1>
          {radar
            ? <a href={RADAR_URL} className="text-sm text-sky-700 hover:underline">Volver al Radar</a>
            : <Link href="/login" className="text-sm text-sky-700 hover:underline">Ir a entrar</Link>}
        </div>
        <Renovar usuario={usuario} radar={radar} />
      </div>
    </main>
  )
}
