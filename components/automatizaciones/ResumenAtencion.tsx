'use client'
import { useEffect, useState } from 'react'
import { PERIODOS, cambio, textoMinutos, type ResumenAtencion as Resumen } from '@/lib/resumenAtencion'

const n = (x: number) => x.toLocaleString('es-VE')
const pct = (a: number, b: number) => (b ? Math.round(a / b * 100) : 0)

/** Flechita de comparación. `menosEsMejor`: para el tiempo de respuesta, bajar es bueno. */
function Cambio({ ahora, antes, menosEsMejor = false }: { ahora: number | null; antes: number | null; menosEsMejor?: boolean }) {
  if (ahora == null || antes == null) return <span className="text-neutral-400">sin dato anterior</span>
  const c = cambio(ahora, antes)
  if (c == null) return <span className="text-neutral-400">antes: 0</span>
  if (c === 0) return <span className="text-neutral-500">igual que antes</span>
  const bueno = menosEsMejor ? c < 0 : c > 0
  return <span className={bueno ? 'text-emerald-600' : 'text-red-600'}>{c > 0 ? '▲' : '▼'} {Math.abs(c)}% vs. antes</span>
}

function Tarjeta({ titulo, valor, detalle, children }: { titulo: string; valor: string; detalle?: string; children?: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-neutral-200 shadow-sm px-4 py-3.5">
      <div className="text-xs font-medium text-neutral-500">{titulo}</div>
      <div className="text-2xl font-semibold tracking-tight num mt-1 text-neutral-900">{valor}</div>
      {detalle && <div className="text-xs text-neutral-600 mt-0.5">{detalle}</div>}
      <div className="text-xs mt-1">{children}</div>
    </div>
  )
}

/**
 * Inicio de Automatizaciones: cómo viene la atención (Fase 5, 2026-11-07). Preguntas → respondidas
 * (cuántas sola la IA) → ventas, y el tiempo de respuesta, contra el período anterior del mismo largo.
 */
export default function ResumenAtencion() {
  const [dias, setDias] = useState<number>(7)
  const [r, setR] = useState<Resumen | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let vivo = true
    setError(false)
    fetch(`/api/automatizaciones/resumen?dias=${dias}`).then(x => x.ok ? x.json() : Promise.reject())
      .then(j => { if (vivo) setR(j) }).catch(() => { if (vivo) setError(true) })
    return () => { vivo = false }
  }, [dias])

  const a = r?.actual, b = r?.anterior
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-neutral-700">Cómo viene tu atención</h2>
          <p className="text-xs text-neutral-500">Últimos {dias} días comparados con los {dias} días anteriores.</p>
        </div>
        <div className="inline-flex rounded-lg border border-neutral-200 bg-white p-0.5 text-xs">
          {PERIODOS.map(p => (
            <button key={p} type="button" onClick={() => setDias(p)}
              className={`px-2.5 py-1 rounded-md ${dias === p ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:text-neutral-900'}`}>{p} días</button>
          ))}
        </div>
      </div>
      {error ? <p className="text-sm text-neutral-500">No se pudo cargar el resumen. Prueba de nuevo en un rato.</p>
        : !a || !b || r!.dias !== dias ? <div className="grid gap-3 grid-cols-2 md:grid-cols-4">{[0, 1, 2, 3].map(i =>
          <div key={i} className="h-[104px] rounded-xl border border-neutral-200 bg-neutral-50 animate-pulse" />)}</div>
        : (
          <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
            <Tarjeta titulo="Preguntas recibidas" valor={n(a.preguntas)}>
              <Cambio ahora={a.preguntas} antes={b.preguntas} />
            </Tarjeta>
            <Tarjeta titulo="Respondidas" valor={a.preguntas ? `${pct(a.respondidas, a.preguntas)}%` : '—'}
              detalle={`${n(a.respondidas)} de ${n(a.preguntas)}${a.porIA ? ` · ${n(a.porIA)} sola la IA` : ''}`}>
              {a.preguntas > 0 && a.porSistema < a.respondidas
                ? <span className="text-neutral-500">{n(a.respondidas - a.porSistema)} desde ML</span>
                : <Cambio ahora={a.respondidas} antes={b.respondidas} />}
            </Tarjeta>
            <Tarjeta titulo="Tiempo de respuesta" valor={textoMinutos(a.mediana)}
              detalle={a.respondidas ? `la mitad en menos · ${pct(a.rapidas, a.respondidas)}% en menos de 1 h` : undefined}>
              <Cambio ahora={a.mediana} antes={b.mediana} menosEsMejor />
            </Tarjeta>
            <Tarjeta titulo="Ventas en MercadoLibre" valor={n(a.ventas)}
              detalle={a.ventas && a.preguntas ? `${(Math.round(a.preguntas / a.ventas * 10) / 10).toLocaleString('es-VE')} preguntas por venta` : undefined}>
              <Cambio ahora={a.ventas} antes={b.ventas} />
            </Tarjeta>
          </div>
        )}
      {a && a.mensajes > 0 && r!.dias === dias && (
        <p className="text-xs text-neutral-500">Además respondiste {n(a.mensajes)} mensaje{a.mensajes === 1 ? '' : 's'} de ventas desde el sistema.</p>
      )}
    </section>
  )
}
