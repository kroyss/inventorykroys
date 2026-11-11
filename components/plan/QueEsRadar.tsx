'use client'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

// «¿Qué es el Radar?» (12-11, el dueño): link discreto en Mi plan para quien no lo conoce. Abre una ventanita con lo de la
// portada del Radar, sus cifras en vivo (/api/radar/cifras) y qué trae cada plan.
const RESPALDO = [{ n: '+48.000', d: 'productos' }, { n: '+320', d: 'categorías' }, { n: '+2.600', d: 'búsquedas en tendencia' }]
const PUNTOS = [
  ['Lo más vendido, categoría por categoría', 'Productos de MercadoLibre Venezuela actualizados cada mes, con su actividad medida: si suben o se apagan.'],
  ['Precio real y tu margen neto', 'Con la brecha cambiaria, la comisión y el envío ya descontados.'],
  ['Competencia y señales de demanda', 'Quién vende más barato, qué sube y qué se sostiene, validado con Google Trends.'],
]

export default function QueEsRadar({ className = '' }: { className?: string }) {
  const [abierto, setAbierto] = useState(false)
  const [cifras, setCifras] = useState(RESPALDO)
  useEffect(() => {
    if (!abierto) return
    fetch('/api/radar/cifras').then(r => (r.ok ? r.json() : null)).then(d => { if (d?.cifras?.length) setCifras(d.cifras) }).catch(() => {})
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false) }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [abierto])
  return (
    <>
      <button type="button" onClick={e => { e.preventDefault(); e.stopPropagation(); setAbierto(true) }}
        className={`text-sky-700 underline underline-offset-2 hover:text-sky-900 ${className}`}>¿Qué es el Radar?</button>
      {abierto && createPortal(
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 sm:items-center sm:p-4" role="dialog" aria-modal="true" onClick={() => setAbierto(false)}>
          <div className="w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-2xl space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-lime-700">Radar de Oportunidades</p>
                <h3 className="mt-1 text-lg font-semibold text-neutral-900">Encuentra qué vender antes que los demás.</h3>
                <p className="mt-1 text-sm text-neutral-600">Inteligencia de mercado para importar y revender en MercadoLibre Venezuela con números reales.</p>
              </div>
              <button type="button" onClick={() => setAbierto(false)} className="text-neutral-400 hover:text-neutral-700" aria-label="Cerrar">✕</button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {cifras.map(c => (
                <div key={c.d} className="rounded-xl bg-lime-50 px-2 py-3 text-center ring-1 ring-inset ring-lime-200">
                  <p className="num text-lg font-bold text-lime-900">{c.n}</p>
                  <p className="text-[11px] leading-tight text-lime-800">{c.d}</p>
                </div>
              ))}
            </div>
            <ul className="space-y-2.5">
              {PUNTOS.map(([t, d]) => (
                <li key={t} className="flex gap-2.5 text-sm">
                  <span className="mt-0.5 text-lime-600">✓</span>
                  <span><b className="text-neutral-900">{t}</b><span className="block text-neutral-600">{d}</span></span>
                </li>
              ))}
            </ul>
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-xs text-neutral-700 space-y-1">
              <p><b>Con Automatizaciones o Completo:</b> Radar Gratis todos los días (el catálogo del mes anterior).</p>
              <p><b>Con Radar PRO</b> ($6/mes, el primer mes de regalo): los sábados y domingos, lo de este mes, sellos, filtros, Competencia y Tendencias.</p>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setAbierto(false)} className="btn-secondary text-sm">Cerrar</button>
              <a href="https://radar.elcomerciantedigital.com" target="_blank" rel="noopener" className="btn-primary text-sm">Ver el Radar ↗</a>
            </div>
          </div>
        </div>, document.body)}
    </>
  )
}
