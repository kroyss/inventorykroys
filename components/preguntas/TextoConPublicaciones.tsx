'use client'
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type TextareaHTMLAttributes } from 'react'

// Cuadro de respuesta con "#" (2026-10-13): escribir "#bolsa" (o "#bolsa grande", o el código "#747862977")
// busca entre las publicaciones activas de la MISMA cuenta y, al elegir una, el "#bolsa" se cambia por su link.
// Flechas + Enter o clic para elegir; Esc lo cierra y deja el texto como está.
// 17-10: el título va en una línea que se desliza (con el dedo en el celular; sola en la fila marcada en la PC),
// la lista se abre arriba del cuadro si abajo no hay lugar (celular con teclado) y tiene el alto del espacio libre.

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

/** Título en una línea que se puede leer completo: se desliza con el dedo, o solo (ida y vuelta) si `animar`. */
function TituloDeslizable({ texto, animar }: { texto: string; animar: boolean }) {
  const caja = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const el = caja.current
    if (!el) return
    el.scrollLeft = 0
    if (!animar || el.scrollWidth <= el.clientWidth + 2) return
    let pos = 0, dir = 1, pausa = 40          // ~0,7 s quieto en cada punta
    const t = setInterval(() => {
      if (pausa > 0) { pausa--; return }
      pos += dir * 1.5
      const max = el.scrollWidth - el.clientWidth
      if (pos >= max) { pos = max; dir = -1; pausa = 50 }
      if (pos <= 0) { pos = 0; dir = 1; pausa = 50 }
      el.scrollLeft = pos
    }, 16)
    return () => clearInterval(t)
  }, [animar, texto])
  return (
    <span ref={caja} title={texto}
      className="block overflow-x-auto whitespace-nowrap text-sm text-neutral-800 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {texto}
    </span>
  )
}

export default function TextoConPublicaciones({ value, onTexto, cuenta, onKeyDown, ...resto }: Props) {
  const area = useRef<HTMLTextAreaElement>(null)
  const [busqueda, setBusqueda] = useState<{ q: string; desde: number; hasta: number } | null>(null)
  const [lista, setLista] = useState<Publicacion[]>([])
  const [activa, setActiva] = useState(0)
  const [cerradoEn, setCerradoEn] = useState<number | null>(null)   // Esc: no volver a abrir en ese "#"
  // Dónde abrir la lista y cuánto alto tiene (según el espacio libre en pantalla, con o sin teclado).
  const [lugar, setLugar] = useState<{ arriba: boolean; alto: number }>({ arriba: false, alto: 320 })
  const [conMouse, setConMouse] = useState(false)   // PC: el título de la fila marcada se desliza solo
  useEffect(() => { setConMouse(window.matchMedia('(hover: hover) and (pointer: fine)').matches) }, [])

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

  // Abajo si entra; si no (lo normal en el celular con el teclado abierto), arriba del cuadro.
  useLayoutEffect(() => {
    if (!abierta) return
    const medir = () => {
      const el = area.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const vv = window.visualViewport
      const top = vv ? vv.offsetTop : 0
      const alto = vv ? vv.height : window.innerHeight
      const abajo = top + alto - r.bottom - 12
      const arriba = r.top - top - 12
      // Celular/tablet (táctil): el teclado SIEMPRE está abajo y en el iPhone no achica la página (el cálculo
      // de "abajo" daba lugar y la lista quedaba detrás del teclado, 17-10): arriba, salvo que no haya espacio.
      // También pantallas angostas (celular, o la vista de celular en la PC), aunque tengan mouse.
      const tactil = window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 640
      const usarArriba = tactil ? arriba >= 140 || arriba > abajo : abajo < 220 && arriba > abajo
      setLugar({ arriba: usarArriba, alto: Math.max(120, Math.min(320, usarArriba ? arriba : abajo)) })
    }
    medir()
    const vv = window.visualViewport
    vv?.addEventListener('resize', medir)
    window.addEventListener('scroll', medir, true)
    return () => { vv?.removeEventListener('resize', medir); window.removeEventListener('scroll', medir, true) }
  }, [abierta])

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

  // Con las flechas, la fila marcada siempre a la vista.
  const listaRef = useRef<HTMLUListElement>(null)
  useEffect(() => {
    listaRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [activa])

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
        <ul ref={listaRef} role="listbox" style={{ maxHeight: lugar.alto }}
          className={`absolute left-0 right-0 z-20 overflow-y-auto overscroll-contain touch-pan-y rounded-lg border border-neutral-200 bg-white py-1 shadow-lg ${
            lugar.arriba ? 'bottom-full mb-1' : 'top-full mt-1'}`}>
          <li className="px-3 pb-1 pt-0.5 text-[11px] text-neutral-400">Publicaciones de {cuenta} · desliza el título para leerlo · toca para poner el link</li>
          {lista.map((p, i) => (
            // El clic elige (no el "mousedown"): así deslizar el título o la lista con el dedo no elige sin querer.
            <li key={p.item_id} role="option" aria-selected={i === activa}
              onMouseDown={e => e.preventDefault()} onClick={() => elegir(p)} onMouseEnter={() => setActiva(i)}
              className={`flex cursor-pointer items-center gap-2.5 px-3 py-1.5 ${i === activa ? 'bg-lime-50' : ''}`}>
              {p.thumbnail
                ? <img src={p.thumbnail} alt="" className="h-9 w-9 shrink-0 rounded border border-neutral-100 object-contain bg-white" /> // eslint-disable-line @next/next/no-img-element
                : <span className="h-9 w-9 shrink-0 rounded bg-neutral-100" />}
              <span className="min-w-0 flex-1">
                <TituloDeslizable texto={p.titulo} animar={conMouse && i === activa} />
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
