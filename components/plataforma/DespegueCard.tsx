'use client'
// Programa Despegue en Plataforma (21-10, migración 112): el contador de cupos de la página /despegue (se sube a
// mano cuando alguien paga: el cobro va por Telegram) y cómo va la página (entraron, vieron el video, tocaron
// "Apartar mi cupo").
import { useEffect, useState } from 'react'

interface Datos {
  grupo: { nombre: string; cupos: number; tomados: number; inicio: string; aparta_hasta: string } | null
  embudo: { personas: number; video: number; telegram: number; personas_hoy: number; telegram_hoy: number }
  origenes: { origen: string; personas: number; telegram: number }[]
}

const dd = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`

export default function DespegueCard() {
  const [d, setD] = useState<Datos | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    fetch('/api/plataforma/despegue').then(r => (r.ok ? r.json() : null)).then(j => { if (vivo && j) setD(j) }).catch(() => {})
    return () => { vivo = false }
  }, [])

  const cambiar = async (tomados: number) => {
    if (!d?.grupo) return
    setGuardando(true); setError(null)
    const r = await fetch('/api/plataforma/despegue', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tomados }),
    }).catch(() => null)
    const j = await r?.json().catch(() => ({}))
    setGuardando(false)
    if (!r?.ok) { setError(j?.error ?? 'No se pudo guardar'); return }
    setD(x => x && x.grupo ? { ...x, grupo: { ...x.grupo, tomados: j.tomados } } : x)
  }

  if (!d) return null
  const g = d.grupo
  const enlace = typeof window !== 'undefined' ? `${window.location.origin}/despegue` : '/despegue'
  return (
    <div className="rounded-xl border border-lime-300 bg-white px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-neutral-800">🚀 Programa Despegue{g ? <span className="font-normal text-neutral-500"> · {g.nombre}</span> : null}</p>
        <a href={enlace} target="_blank" rel="noreferrer" className="text-xs text-neutral-500 underline hover:text-neutral-800">Ver la página ↗</a>
      </div>
      {g ? (
        <div className="mt-3 grid gap-4 sm:grid-cols-[1fr_1.2fr]">
          <div>
            <p className="text-xs text-neutral-500">Cupos pagados (lo que dice la página: «Quedan {g.cupos - g.tomados} de {g.cupos}»)</p>
            <div className="mt-2 flex items-center gap-3">
              <button type="button" onClick={() => cambiar(g.tomados - 1)} disabled={guardando || g.tomados <= 0}
                className="btn-secondary !px-3 text-lg leading-none" aria-label="Uno menos">−</button>
              <span className="min-w-[4.5rem] text-center text-2xl font-semibold tabular-nums">{g.tomados} / {g.cupos}</span>
              <button type="button" onClick={() => cambiar(g.tomados + 1)} disabled={guardando || g.tomados >= g.cupos}
                className="btn-primary !px-3 text-lg leading-none" aria-label="Uno más (pagó)">+</button>
            </div>
            <div className="mt-2 flex gap-1">
              {Array.from({ length: g.cupos }, (_, i) => (
                <span key={i} className={`h-2 flex-1 rounded-full ${i < g.tomados ? 'bg-lime-500' : 'bg-neutral-200'}`} />
              ))}
            </div>
            <p className="mt-2 text-xs text-neutral-500">Apartan hasta el {dd(g.aparta_hasta)} · inicio {dd(g.inicio)}. Toca + cuando alguien paga.</p>
            {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
          </div>
          <div className="text-xs text-neutral-600">
            <p className="font-medium text-neutral-800">La página</p>
            <div className="mt-1 grid grid-cols-3 gap-2 text-center">
              {([['Entraron', d.embudo.personas, d.embudo.personas_hoy], ['Vieron el video', d.embudo.video, null],
                 ['Tocaron Telegram', d.embudo.telegram, d.embudo.telegram_hoy]] as const).map(([t, n, h]) => (
                <div key={t} className="rounded-lg bg-neutral-50 px-2 py-2">
                  <p className="text-lg font-semibold tabular-nums text-neutral-900">{n}</p>
                  <p className="leading-tight text-neutral-500">{t}</p>
                  {h != null && <p className="text-[11px] text-lime-700">{h} hoy</p>}
                </div>
              ))}
            </div>
            {d.origenes.length > 0 && (
              <p className="mt-2 text-neutral-500">
                Llegaron por: {d.origenes.map(o => `${o.origen} ${o.personas}${o.telegram ? ` (${o.telegram} a Telegram)` : ''}`).join(' · ')}
              </p>
            )}
          </div>
        </div>
      ) : <p className="mt-2 text-xs text-neutral-500">No hay grupo cargado (migración 112).</p>}
    </div>
  )
}
