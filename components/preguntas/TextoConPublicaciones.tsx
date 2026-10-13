'use client'
import { useEffect, useRef, useState, type KeyboardEvent, type TextareaHTMLAttributes } from 'react'

// Cuadro de respuesta con "#" (2026-10-13): escribir "#bolsa" (o "#bolsa grande") busca entre las
// publicaciones activas de la MISMA cuenta y, al elegir una, el "#bolsa" se cambia por su link.
// Flechas + Enter o clic para elegir; Esc lo cierra y deja el texto como está.

interface Publicacion {
  item_id: string; titulo: string; precio: number | null; moneda: string | null
  disponible: number | null; permalink: string; thumbnail: string | null
}

// "#" al inicio o después de un espacio, seguido de lo que se busca (hasta el cursor, sin saltos de línea).
const DISPARADOR = /(^|\s)#([^\s#][^#\n]{0,40})$/

type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> & {
  value: string
  onTexto: (t: string) => void
  cuenta: string
}

export default function TextoConPublicaciones({ value, onTexto, cuenta, onKeyDown, ...resto }: Props) {
  const area = useRef<HTMLTextAreaElement>(null)
  const [busqueda, setBusqueda] = useState<{ q: string; desde: number; hasta: number } | null>(null)
  const [lista, setLista] = useState<Publicacion[]>([])
  const [activa, setActiva] = useState(0)
  const [cerradoEn, setCerradoEn] = useState<number | null>(null)   // Esc: no volver a abrir en ese "#"

  const leerCursor = (texto: string) => {
    const el = area.current
    const cursor = el?.selectionStart ?? texto.length
    const m = texto.slice(0, cursor).match(DISPARADOR)
    if (!m) { setBusqueda(null); return }
    const desde = cursor - m[2].length - 1   // posición del "#"
    if (desde === cerradoEn) { setBusqueda(null); return }
    setBusqueda({ q: m[2].trim(), desde, hasta: cursor })
  }

  useEffect(() => {
    if (!busqueda || busqueda.q.length < 2) { setLista([]); return }
    const ctl = new AbortController()
    const t = setTimeout(() => {
      fetch(`/api/preguntas/publicaciones?cuenta=${encodeURIComponent(cuenta)}&q=${encodeURIComponent(busqueda.q)}`, { signal: ctl.signal })
        .then(r => (r.ok ? r.json() : [])).then((l: Publicacion[]) => { setLista(l); setActiva(0) }).catch(() => {})
    }, 150)
    return () => { clearTimeout(t); ctl.abort() }
  }, [busqueda?.q, cuenta])   // eslint-disable-line react-hooks/exhaustive-deps

  const abierta = !!busqueda && lista.length > 0

  const elegir = (p: Publicacion) => {
    if (!busqueda) return
    const antes = value.slice(0, busqueda.desde)
    const despues = value.slice(busqueda.hasta)
    const link = p.permalink + (despues.startsWith(' ') ? '' : ' ')
    onTexto(antes + link + despues)
    setBusqueda(null); setLista([])
    const pos = antes.length + link.length
    requestAnimationFrame(() => { area.current?.focus(); area.current?.setSelectionRange(pos, pos) })
  }

  const teclas = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (abierta) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActiva(i => (i + 1) % lista.length); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActiva(i => (i - 1 + lista.length) % lista.length); return }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); elegir(lista[activa]); return }
      if (e.key === 'Escape') { e.preventDefault(); setCerradoEn(busqueda!.desde); setBusqueda(null); return }
    }
    onKeyDown?.(e)
  }

  return (
    <div className="relative">
      <textarea ref={area} {...resto} value={value}
        onChange={e => { onTexto(e.target.value); leerCursor(e.target.value) }}
        onKeyDown={teclas}
        onKeyUp={e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home' || e.key === 'End') leerCursor(value) }}
        onClick={() => leerCursor(value)}
        onBlur={() => setTimeout(() => setBusqueda(null), 150)} />
      {!abierta && !value.includes('#') && (
        <p className="mt-0.5 text-[11px] text-neutral-400">
          Tip: escribe <b className="font-medium text-neutral-500">#</b> y una palabra (p.ej. <i>#bolsa</i>) para poner el link de otra publicación tuya.
        </p>
      )}
      {abierta && (
        <ul role="listbox" className="absolute left-0 right-0 top-full z-20 mt-1 max-h-80 overflow-auto rounded-lg border border-neutral-200 bg-white py-1 shadow-lg">
          <li className="px-3 pb-1 pt-0.5 text-[11px] text-neutral-400">Publicaciones de {cuenta} · Enter pone el link · Esc cierra</li>
          {lista.map((p, i) => (
            <li key={p.item_id} role="option" aria-selected={i === activa}
              onMouseDown={e => { e.preventDefault(); elegir(p) }} onMouseEnter={() => setActiva(i)}
              className={`flex cursor-pointer items-center gap-2.5 px-3 py-1.5 ${i === activa ? 'bg-lime-50' : ''}`}>
              {p.thumbnail
                ? <img src={p.thumbnail} alt="" className="h-9 w-9 shrink-0 rounded border border-neutral-100 object-contain bg-white" /> // eslint-disable-line @next/next/no-img-element
                : <span className="h-9 w-9 shrink-0 rounded bg-neutral-100" />}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-neutral-800">{p.titulo}</span>
                <span className="block text-[11px] text-neutral-500">
                  {p.precio != null && <>{p.moneda === 'VES' ? 'Bs' : '$'} {p.precio.toLocaleString('de-DE', { maximumFractionDigits: 2 })} · </>}
                  {p.disponible} disponibles
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
