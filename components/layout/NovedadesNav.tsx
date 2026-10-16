'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { Novedad } from '@/lib/novedades'

// Novedades (migración 095): megáfono de trazo junto al libro de Aprendizaje, con un puntito verde cuando
// hay algo que esta persona no vio. Abre un panel con la lista; al abrirlo se dan por vistas. En el
// celular la barra no lo muestra: va en "Más" → Novedades (app/(main)/novedades).

export function Megafono({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"
      strokeLinejoin="round" className={`shrink-0 ${className}`}>
      <path d="M3 10v4a1 1 0 0 0 1 1h3l6 4V5L7 9H4a1 1 0 0 0-1 1z" />
      <path d="M17 9a4 4 0 0 1 0 6" /><path d="M19.5 6.5a8 8 0 0 1 0 11" />
    </svg>
  )
}

const fechaCorta = (f: string) => {
  const [y, m, d] = f.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-VE', { day: 'numeric', month: 'short' })
}

/** La lista (la usan el panel y la página del celular). Si hay nuevas, las ya vistas quedan plegadas en
 *  "Ver anteriores"; si no hay nuevas, se ven todas. */
export function ListaNovedades({ items, onIr }: { items: Novedad[]; onIr?: () => void }) {
  const [anteriores, setAnteriores] = useState(false)
  if (!items.length) return <p className="px-4 py-6 text-sm text-neutral-500 text-center">Todavía no hay novedades.</p>
  const nuevas = items.filter(n => n.nueva)
  const vistas = items.filter(n => !n.nueva)
  const plegar = nuevas.length > 0 && vistas.length > 0
  return <>
    <Filas items={plegar ? nuevas : items} onIr={onIr} />
    {plegar && (
      <>
        <button type="button" onClick={() => setAnteriores(a => !a)}
          className="w-full flex items-center gap-1.5 px-4 py-2 border-t border-neutral-100 text-xs text-neutral-500 hover:bg-neutral-50">
          <span className={`transition-transform ${anteriores ? 'rotate-90' : ''}`}>▶</span>
          {anteriores ? 'Ocultar anteriores' : `Ver anteriores (${vistas.length})`}
        </button>
        {anteriores && <div className="border-t border-neutral-100"><Filas items={vistas} onIr={onIr} /></div>}
      </>
    )}
  </>
}

function Filas({ items, onIr }: { items: Novedad[]; onIr?: () => void }) {
  return (
    <ul className="divide-y divide-neutral-100">
      {items.map(n => (
        <li key={n.id} className="px-4 py-3">
          <div className="flex items-center gap-2 text-xs text-neutral-500">
            <span>{fechaCorta(n.fecha)}</span><span>·</span><span className="font-medium text-neutral-700">{n.titulo}</span>
            {n.nueva && <span className="ml-auto rounded-full bg-lime-100 text-lime-800 px-1.5 py-px text-[10px] font-medium">Nuevo</span>}
          </div>
          <p className="mt-1 text-sm text-neutral-800 leading-snug">{n.texto}</p>
          {n.enlace && (
            <Link href={n.enlace} onClick={onIr} className="mt-1 inline-block text-xs font-medium text-lime-800 hover:underline">Ver →</Link>
          )}
        </li>
      ))}
    </ul>
  )
}

export default function NovedadesNav() {
  const pathname = usePathname()
  const [datos, setDatos] = useState<{ items: Novedad[]; nuevas: number } | null>(null)
  const [abierto, setAbierto] = useState(false)
  const caja = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let vivo = true
    fetch('/api/novedades', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then(d => { if (vivo && d) setDatos(d) }).catch(() => {})
    return () => { vivo = false }
  }, [pathname])

  useEffect(() => {
    if (!abierto) return
    const fuera = (e: MouseEvent) => { if (!caja.current?.contains(e.target as Node)) setAbierto(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false) }
    document.addEventListener('mousedown', fuera)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', esc) }
  }, [abierto])

  if (!datos || datos.items.length === 0) return null

  const abrir = () => {
    const a = !abierto
    setAbierto(a)
    // Se dan por vistas al abrir; el "Nuevo" de cada una se mantiene mientras el panel está abierto.
    if (a && datos.nuevas > 0) {
      fetch('/api/novedades/vistas', { method: 'POST' }).catch(() => {})
      setDatos({ ...datos, nuevas: 0 })
    }
    if (!a) setDatos(d => d && { ...d, items: d.items.map(i => ({ ...i, nueva: false })) })
  }

  return (
    <div ref={caja} className="relative hidden md:block shrink-0">
      <button type="button" onClick={abrir} aria-haspopup="dialog" aria-expanded={abierto}
        title={datos.nuevas ? `Novedades: ${datos.nuevas} sin ver` : 'Novedades'}
        className={`relative flex items-center rounded-full p-1.5 transition-colors ${abierto ? 'bg-neutral-100 text-neutral-900' : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800'}`}>
        <Megafono />
        {datos.nuevas > 0 && <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-lime-500 ring-2 ring-white" />}
        <span className="sr-only">Novedades</span>
      </button>
      {abierto && (
        <div role="dialog" aria-label="Novedades"
          className="absolute right-0 top-full mt-1.5 w-80 bg-white border border-neutral-200 rounded-xl shadow-lg z-30 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-neutral-100">
            <Megafono className="w-4 h-4 text-neutral-500" />
            <span className="text-sm font-semibold text-neutral-800">Novedades</span>
            <span className="text-xs text-neutral-400">lo que mejoramos</span>
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            <ListaNovedades items={datos.items} onIr={() => setAbierto(false)} />
          </div>
        </div>
      )}
    </div>
  )
}
