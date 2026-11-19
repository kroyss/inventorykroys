'use client'
import Link from '@/components/ui/Link'

// 19-11 (Inicio nuevo): los pendientes como chips compactos (punto de estado + nombre corto + número). Solo salen los
// que tienen algo, en el orden en que llegan (por urgencia); los que están en 0, en una línea gris «Al día». Lo usan el
// Inicio completo y el del empleado.
export interface Pendiente {
  label: string
  n: number | null          // null = todavía cargando
  tono: 'problema' | 'atencion' | 'info'
  href: string
  ayuda: string             // qué es (title al pasar el mouse)
}

const PUNTO = { problema: 'bg-red-500', atencion: 'bg-amber-500', info: 'bg-neutral-400' } as const

export default function Pendientes({ items, titulo = true }: { items: Pendiente[]; titulo?: boolean }) {
  const conAlgo = items.filter(p => (p.n ?? 0) > 0)
  const enCero = items.filter(p => p.n === 0)
  const cargando = items.some(p => p.n == null)
  return (
    <section aria-labelledby="pend-t" className="space-y-2">
      <h2 id="pend-t" className={titulo ? 'text-sm font-semibold text-neutral-700' : 'sr-only'}>Pendientes</h2>
      {conAlgo.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {conAlgo.map(p => (
            <Link key={p.label} href={p.href} title={p.ayuda}
              className="group inline-flex items-center gap-2 rounded-lg border border-neutral-200 bg-white py-1.5 pl-3 pr-2.5 shadow-sm transition hover:-translate-y-px hover:border-neutral-300 hover:shadow-md">
              <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${PUNTO[p.tono]}`} />
              <span className="text-sm text-neutral-600">{p.label}</span>
              <span className="num text-base font-semibold tabular-nums text-neutral-900">{(p.n ?? 0).toLocaleString('es-VE')}</span>
              <span aria-hidden className="text-xs text-neutral-300 transition-colors group-hover:text-neutral-500">→</span>
            </Link>
          ))}
        </div>
      ) : !cargando ? (
        <p className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-sm text-emerald-900">
          <span aria-hidden className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-[11px] font-bold text-white">✓</span>
          Nada pendiente hoy.
        </p>
      ) : <div className="h-9 w-72 max-w-full animate-pulse rounded-lg bg-neutral-100" />}
      {conAlgo.length > 0 && enCero.length > 0 && (
        <p className="text-xs text-neutral-500">
          <span aria-hidden className="mr-1 text-emerald-600">✓</span>Al día: {enCero.map(p => p.label.toLowerCase()).join(' · ')}
        </p>
      )}
    </section>
  )
}
