'use client'
import Link from 'next/link'
import { useAvisos, type Avisos } from '@/components/layout/Avisos'

// Íconos de trazo (24x24)
const ICONOS = {
  preguntas: <><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8L12 3z" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z" /></>,
  mensajes: <><path d="M4 5h16v11H8l-4 4V5z" /><path d="M8 9h8M8 12h5" /></>,
  calificaciones: <><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9L12 3.5z" /></>,
  despachos: <><path d="M3 7l9-4 9 4-9 4-9-4z" /><path d="M3 7v10l9 4 9-4V7" /><path d="M12 11v10" /></>,
  reportador: <><path d="M3 11l18-8-8 18-2-8-8-2z" /></>,
}

export interface Herramienta {
  href: string; titulo: string; texto: string; icono: keyof typeof ICONOS
  activa: boolean; aviso?: keyof Avisos; urgente?: boolean; pendiente?: string
}

function Icono({ de, activa }: { de: keyof typeof ICONOS; activa: boolean }) {
  return (
    <span className={`w-10 h-10 shrink-0 rounded-lg flex items-center justify-center ${activa ? 'bg-neutral-900 text-lime-400' : 'bg-neutral-100 text-neutral-400'}`}>
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8}
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONOS[de]}</svg>
    </span>
  )
}

/**
 * Inicio de Automatizaciones: arriba lo que está pendiente HOY (con los mismos numeritos
 * del menú, en vivo), abajo todas las herramientas agrupadas por momento de la venta.
 */
export default function InicioAutomatizaciones({ grupos }: { grupos: { titulo: string; texto: string; items: Herramienta[] }[] }) {
  const avisos = useAvisos()
  const todas = grupos.flatMap(g => g.items).filter(h => h.activa && h.aviso)
  const pendientes = todas.filter(h => avisos[h.aviso!] > 0)

  return (
    <div className="space-y-8">
      {/* ── Pendiente hoy ── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-neutral-700">Pendiente ahora</h2>
        {todas.length === 0 ? null : pendientes.length === 0 ? (
          <div className="bg-white rounded-xl border border-neutral-200 shadow-sm px-5 py-4 flex items-center gap-3">
            <span className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">✓</span>
            <p className="text-sm text-neutral-700">Todo al día: no hay preguntas, mensajes, guías ni calificaciones pendientes.</p>
          </div>
        ) : (
          <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
            {pendientes.map(h => {
              const n = avisos[h.aviso!]
              return (
                <Link key={h.href} href={h.href}
                  className="group bg-white rounded-xl border border-neutral-200 shadow-sm px-4 py-3.5 hover:border-neutral-400 hover:shadow transition-all">
                  <div className="flex items-center justify-between gap-2 text-xs font-medium text-neutral-500">
                    {h.titulo}<span className="text-neutral-300 group-hover:text-neutral-500">→</span>
                  </div>
                  <div className={`text-2xl font-semibold tracking-tight num mt-1 ${h.urgente ? 'text-red-600' : 'text-amber-600'}`}>{n}</div>
                  <div className="text-xs text-neutral-500 mt-0.5">{h.pendiente}</div>
                </Link>
              )
            })}
          </div>
        )}
      </section>

      {/* ── Herramientas ── */}
      {grupos.map(g => (
        <section key={g.titulo} className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-neutral-700">{g.titulo}</h2>
            <p className="text-xs text-neutral-500">{g.texto}</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {g.items.map(h => {
              const n = h.aviso ? avisos[h.aviso] : 0
              const cuerpo = (
                <div className={`group h-full flex gap-3 bg-white rounded-xl border p-4 ${h.activa
                  ? 'border-neutral-200 shadow-sm hover:border-neutral-400 hover:shadow transition-all' : 'border-dashed border-neutral-200 bg-neutral-50/60'}`}>
                  <Icono de={h.icono} activa={h.activa} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className={`font-semibold ${h.activa ? 'text-neutral-900' : 'text-neutral-500'}`}>{h.titulo}</h3>
                      {h.activa && n > 0 && (
                        <span className={`min-w-[1.15rem] h-[1.15rem] px-1 rounded-full text-[11px] font-semibold flex items-center justify-center num ${h.urgente ? 'bg-red-500 text-white' : 'bg-amber-400 text-amber-950'}`}>{n}</span>
                      )}
                      {!h.activa && <span className="text-[11px] font-medium bg-neutral-100 text-neutral-500 rounded-full px-2 py-0.5">No incluido</span>}
                      {h.activa && <span className="ml-auto text-sm text-neutral-300 group-hover:text-neutral-700">→</span>}
                    </div>
                    <p className={`text-sm mt-1 ${h.activa ? 'text-neutral-600' : 'text-neutral-400'}`}>{h.texto}</p>
                  </div>
                </div>
              )
              return h.activa ? <Link key={h.href} href={h.href}>{cuerpo}</Link> : <div key={h.href}>{cuerpo}</div>
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
