'use client'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { Cargando, PageHeader } from '@/components/ui'

interface Seccion { id: string; titulo: string; texto: string; pendientes: number }

const RUTA: Record<string, string> = {
  despachos: '/despachos', reportador: '/reportador', preguntas: '/preguntas',
  mensajes: '/mensajes', calificaciones: '/calificaciones', stock: '/alertas-stock',
}

// Cuenta de demostración: lo pendiente de cada sección y un botón para dejarla como al principio
// (para repetir una toma). Cada sección se restaura sola; "Restaurar todo" deja la cuenta entera.
export default function DemoClient() {
  const [datos, setDatos] = useState<{ secciones: Seccion[]; esAdmin: boolean; max: Record<string, number> } | null>(null)
  // Cuántas preguntas / conversaciones sin leer deja cada restauración (vacío = todas).
  const [cantidad, setCantidad] = useState<Record<string, number | null>>({ preguntas: null, mensajes: null })
  const [trabajando, setTrabajando] = useState<string | null>(null)
  const [listo, setListo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(() => fetch('/api/demo', { cache: 'no-store' })
    .then(async r => ({ ok: r.ok, d: await r.json() }))
    .then(({ ok, d }) => { if (ok) setDatos(d); else setError(d.error ?? 'No se pudo leer la demo') }), [])
  useEffect(() => { cargar() }, [cargar])

  async function restaurar(ids: string[], clave: string) {
    setTrabajando(clave); setListo(null); setError(null)
    try {
      const r = await fetch('/api/demo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        secciones: ids, preguntas: cantidad.preguntas ?? undefined, mensajes: cantidad.mensajes ?? undefined,
      }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error ?? 'No se pudo restaurar')
      await cargar()
      setListo(clave)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setTrabajando(null)
    }
  }

  const todas = datos?.secciones.map(s => s.id) ?? []
  return (
    <div>
      <PageHeader title="Demo" subtitle="Cuenta de demostración: datos ficticios que se ven reales. Nada sale a MercadoLibre."
        actions={datos?.esAdmin ? (
          <button onClick={() => restaurar(todas, 'todo')} disabled={!!trabajando}
            className="px-4 py-2 rounded-lg bg-neutral-900 text-white text-sm font-semibold hover:bg-neutral-700 disabled:opacity-50">
            {trabajando === 'todo' ? 'Restaurando…' : listo === 'todo' ? '✓ Todo restaurado' : 'Restaurar todo'}
          </button>
        ) : undefined} />

      {error && <p className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</p>}
      {!datos ? <Cargando /> : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {datos.secciones.map(s => (
            <div key={s.id} className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4 flex flex-col">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="font-semibold text-neutral-900">{s.titulo}</h2>
                <span className={`text-sm font-semibold num ${s.pendientes ? 'text-amber-700' : 'text-emerald-700'}`}>
                  {s.pendientes ? `${s.pendientes} pendientes` : '✓ al día'}
                </span>
              </div>
              <p className="mt-1 text-sm text-neutral-500 flex-1">{s.texto}</p>
              {datos.esAdmin && datos.max[s.id] && (
                <label className="mt-3 flex items-center gap-2 text-sm text-neutral-600">
                  Al restaurar, dejar
                  <select value={cantidad[s.id] ?? datos.max[s.id]}
                    onChange={e => setCantidad(c => ({ ...c, [s.id]: Number(e.target.value) }))}
                    className="border border-neutral-300 rounded-lg px-2 py-1 text-sm num">
                    {Array.from({ length: datos.max[s.id] }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                  {s.id === 'preguntas' ? 'preguntas' : 'conversaciones sin leer'}
                </label>
              )}
              <div className="mt-3 flex items-center gap-2">
                {datos.esAdmin && (
                  <button onClick={() => restaurar([s.id], s.id)} disabled={!!trabajando}
                    className="px-3 py-1.5 rounded-lg border border-neutral-300 text-sm font-medium hover:bg-neutral-50 disabled:opacity-50">
                    {trabajando === s.id ? 'Restaurando…' : listo === s.id ? '✓ Restaurada' : 'Restaurar'}
                  </button>
                )}
                <Link href={RUTA[s.id]} className="px-3 py-1.5 rounded-lg text-sm font-medium text-lime-800 hover:bg-lime-50">Ir →</Link>
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="mt-6 text-xs text-neutral-400">
        Las etiquetas PDF de Despachos (50: ZOOM y TEALCA) están en la carpeta «Demo videos/Despachos». Restaurar borra lo que se hizo
        en vivo en esa sección y la deja como al principio; las demás no se tocan.
      </p>
    </div>
  )
}
