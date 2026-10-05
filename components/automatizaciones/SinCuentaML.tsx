import Link from 'next/link'
import { PageHeader } from '@/components/ui'
import { LinkConectar } from '@/components/preguntas/PreguntasClient'

// Pantalla de una herramienta de Automatizaciones mientras la empresa no conectó ninguna cuenta de
// MercadoLibre: en vez de una bandeja vacía (o un botón bloqueado), qué gana con esa herramienta y
// el botón para conectar. Se puede entrar a todas y explorar; no se bloquea nada.
export default function SinCuentaML({ titulo, gancho, beneficios, esAdmin, error }: {
  titulo: string; gancho: string; beneficios: string[]; esAdmin: boolean; error?: string | null
}) {
  return (
    <div className="space-y-4">
      <PageHeader title={titulo} subtitle={gancho} />
      {/* Error de la vuelta del OAuth (api/ml/callback y api/ml/conectar vuelven a /preguntas?ml_error=). */}
      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded text-sm">{error}</div>}
      <section className="bg-white rounded-xl border border-neutral-200 shadow-sm p-6 space-y-4">
        <ul className="space-y-2">
          {beneficios.map(b => (
            <li key={b} className="flex gap-2.5 text-sm text-neutral-700">
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round"
                strokeLinejoin="round" className="w-4 h-4 mt-0.5 shrink-0 text-lime-600"><path d="M20 6 9 17l-5-5" /></svg>
              {b}
            </li>
          ))}
        </ul>
        <div className="rounded-lg bg-lime-50 border border-lime-200 p-4 space-y-2">
          <p className="text-sm text-lime-950">
            <b>Para empezar, conecta tu cuenta de MercadoLibre.</b> El sistema nunca publica nada sin que tú lo revises, y
            puedes desconectarla cuando quieras.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            {esAdmin
              ? <a href="/conectar" className="btn-primary text-sm">Conectar ahora</a>
              : <span className="text-sm text-neutral-600">Pídele a un administrador de tu empresa que conecte la cuenta.</span>}
            <Link href="/aprendizaje" className="text-sm text-lime-900 hover:underline">Ver cómo funciona en Aprendizaje →</Link>
          </div>
          {esAdmin && <LinkConectar />}
        </div>
      </section>
    </div>
  )
}
