'use client'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

// Reputación → "Corregir" (2026-10-15): cambia en ML la calificación que LE DIMOS al comprador. Para las
// contradictorias (él dijo que SÍ se concretó y nosotros que NO): lee lo que hay ahora en ML y propone
// "Sí, se concretó · Positiva" con el texto de la plantilla de concretadas. API: /api/reputacion/corregir.

const NOMBRE: Record<string, string> = { positive: 'Positiva', neutral: 'Neutral', negative: 'Negativa' }
const PUNTO: Record<string, string> = { positive: 'bg-emerald-500', neutral: 'bg-orange-500', negative: 'bg-red-500' }
const MAX = 159   // ML acepta comentarios de menos de 160 caracteres

interface Props {
  c: { id: string; pack: string; cuenta: string; nombre: string | null; nick: string | null; rating: string; mensaje: string | null }
  onCerrar: () => void
  onListo: () => void
}
type Nuestra = { rating: string | null; concretada: boolean | null; mensaje: string | null }
type Plantillas = { concretada: { mensaje: string }; noConcretada: { mensaje: string } }

export default function CorregirCalificacion({ c, onCerrar, onListo }: Props) {
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [plantillas, setPlantillas] = useState<Plantillas | null>(null)
  const [actual, setActual] = useState<Nuestra | null>(null)
  const [concretada, setConcretada] = useState(true)
  const [rating, setRating] = useState<'positive' | 'neutral' | 'negative'>('positive')
  const [mensaje, setMensaje] = useState('')

  useEffect(() => {
    let vivo = true
    fetch(`/api/reputacion/corregir?id=${c.id}`).then(async r => {
      const d = await r.json().catch(() => ({}))
      if (!vivo) return
      if (!r.ok) { setError(d.error ?? 'No se pudo leer la calificación en MercadoLibre'); setCargando(false); return }
      setActual(d.nuestra ?? null)
      setPlantillas(d.plantillas ?? null)
      setMensaje((d.plantillas?.concretada?.mensaje ?? '').slice(0, MAX))
      setCargando(false)
    })
    return () => { vivo = false }
  }, [c.id])

  // Esc cierra solo esta ventana.
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onCerrar() } }
    window.addEventListener('keydown', h, true)
    return () => window.removeEventListener('keydown', h, true)
  }, [onCerrar])

  const textoDe = (x: boolean) => ((x ? plantillas?.concretada.mensaje : plantillas?.noConcretada.mensaje) ?? '').slice(0, MAX)
  const elegirConcretada = (v: boolean) => {
    setConcretada(v)
    // Pasa al texto de la otra plantilla, si no lo cambiaron a mano.
    if (mensaje === textoDe(!v)) setMensaje(textoDe(v))
    if (!v && rating === 'positive') setRating('neutral')
  }

  const guardar = async () => {
    setGuardando(true); setError(null)
    const r = await fetch('/api/reputacion/corregir', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: c.id, concretada, rating, mensaje }),
    })
    const d = await r.json().catch(() => ({}))
    setGuardando(false)
    if (!r.ok) { setError(d.error ?? 'No se pudo cambiar'); return }
    onListo()
  }

  const opcion = (on: boolean) => `flex-1 inline-flex items-center justify-center rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${on
    ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 bg-white text-neutral-700 hover:border-neutral-500'}`

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 sm:items-center sm:p-4"
      onMouseDown={e => { if (e.target === e.currentTarget) onCerrar() }} role="dialog" aria-modal="true" aria-label="Corregir mi calificación">
      <div className="w-full max-w-lg rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-neutral-100 px-5 py-4">
          <div className="min-w-0">
            <h3 className="font-semibold text-neutral-900">Corregir mi calificación</h3>
            <p className="truncate text-xs text-neutral-500">{c.nombre ?? c.nick ?? 'Comprador'} · {c.cuenta} · venta {c.pack}</p>
          </div>
          <button onClick={onCerrar} className="btn-ghost !px-2 !py-1" aria-label="Cerrar">✕</button>
        </div>

        <div className="space-y-4 px-5 py-4">
          {cargando ? <p className="text-sm text-neutral-400">Leyendo la calificación en MercadoLibre…</p> : (
            <>
              <div className="space-y-0.5 rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
                <p><b className="text-neutral-800">El comprador:</b> {NOMBRE[c.rating] ?? c.rating} · dijo que la venta <b>sí se concretó</b>
                  {c.mensaje ? ` · “${c.mensaje}”` : ''}</p>
                {actual && (
                  <p><b className="text-neutral-800">Tú, ahora:</b> {actual.concretada === false ? 'No concretada' : actual.concretada ? 'Concretada' : '—'}
                    {actual.rating ? ` · ${NOMBRE[actual.rating] ?? actual.rating}` : ''}{actual.mensaje ? ` · “${actual.mensaje}”` : ''}</p>
                )}
              </div>

              <div>
                <p className="mb-1.5 text-sm font-medium text-neutral-800">¿Se concretó la venta?</p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => elegirConcretada(true)} className={opcion(concretada)}>Sí, se concretó</button>
                  <button type="button" onClick={() => elegirConcretada(false)} className={opcion(!concretada)}>No se concretó</button>
                </div>
              </div>

              <div>
                <p className="mb-1.5 text-sm font-medium text-neutral-800">Calificación</p>
                <div className="flex gap-2">
                  {(['positive', 'neutral', 'negative'] as const).map(r => (
                    <button key={r} type="button" onClick={() => setRating(r)} className={opcion(rating === r)}>
                      <span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${PUNTO[r]}`} />{NOMBRE[r]}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-1.5 flex items-baseline justify-between text-sm font-medium text-neutral-800">
                  Comentario <span className="text-xs font-normal text-neutral-400">{mensaje.length}/{MAX}</span>
                </p>
                <textarea value={mensaje} onChange={e => setMensaje(e.target.value.slice(0, MAX))} rows={3}
                  className="w-full resize-none rounded-lg border border-neutral-300 px-3 py-2 text-sm" />
              </div>
            </>
          )}
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-neutral-100 px-5 py-3">
          <p className="mr-auto text-[11px] text-neutral-400">Se cambia en MercadoLibre, en la cuenta {c.cuenta}.</p>
          <button onClick={onCerrar} className="btn-ghost text-sm">Cancelar</button>
          <button onClick={guardar} disabled={cargando || guardando || !actual || !mensaje.trim()} className="btn-primary text-sm">
            {guardando ? 'Guardando…' : 'Guardar en MercadoLibre'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
