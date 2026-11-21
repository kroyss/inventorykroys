'use client'
import { useEffect, useRef, useState, type ReactNode } from 'react'

// «Avisos de tu cuenta» (20-11, el dueño; idea vista en Mercasist): las franjas de arriba (vencimiento / prueba / corte,
// cuenta de ML desconectada, créditos de IA, Radar PRO) salen juntas en un solo recuadro: se ve el aviso más importante y
// el resto queda en «Ver N avisos más». Los ROJOS nunca se esconden (si hay dos, se ven los dos). Cada aviso sale en las
// mismas condiciones que antes; solo cambia cómo se agrupan. Los arma AvisosArriba (servidor).
// 21-11 (el dueño: «que los avisos roten… a veces le sale uno, a veces el otro»; «2 avisos puede ser molesto»): las
// OFERTAS (Inventario, Radar PRO) rotan entre ellas en UN solo lugar, con fundido, cada 8 s (se detiene con el mouse o
// el foco encima). En el celular o con «reducir movimiento» no se mueven: sale una distinta en cada visita. Las alertas
// (vencimiento, ML desconectada, créditos) nunca rotan y van primero: con una alerta a la vista, las ofertas quedan en
// «Ver más». Siempre se ve UNA franja (salvo dos rojas).
export type NivelAviso = 'rojo' | 'ambar' | 'verde' | 'gris' | 'info'
export interface ItemAviso {
  id: string
  nivel: NivelAviso
  orden: number          // menor = más importante
  nodo: ReactNode        // la franja tal como se veía antes
  cerrar?: string        // llave del navegador con la que el aviso se cierra solo (Radar PRO): cerrado no se cuenta
  oferta?: boolean       // 21-11: oferta (rota con las otras ofertas)
}

const CADA_MS = 8000

export default function AvisosLista({ items }: { items: ItemAviso[] }) {
  const [cerrados, setCerrados] = useState<Set<string>>(new Set())
  const [abierto, setAbierto] = useState(false)

  useEffect(() => {
    const leer = () => {
      const c = new Set<string>()
      for (const it of items) {
        if (!it.cerrar) continue
        try { if (localStorage.getItem(it.cerrar)) c.add(it.id) } catch { /* sin almacenamiento: se cuenta */ }
      }
      setCerrados(c)
    }
    leer()
    window.addEventListener('aviso-cerrado', leer)
    return () => window.removeEventListener('aviso-cerrado', leer)
  }, [items])

  const lista = items.filter(it => !cerrados.has(it.id)).sort((a, b) => a.orden - b.orden)
  if (!lista.length) return null
  const ofertas = lista.filter(it => it.oferta)
  const alertas = lista.filter(it => !it.oferta)
  const rojos = alertas.filter(it => it.nivel === 'rojo')
  const principales = rojos.length ? rojos : alertas.slice(0, 1)
  const rotan = principales.length ? [] : ofertas
  const resto = lista.filter(it => !principales.includes(it) && !rotan.includes(it))

  return (
    <div role="region" aria-label="Avisos de tu cuenta">
      {principales.map(it => <div key={it.id}>{it.nodo}</div>)}
      {rotan.length > 0 && <Rotador items={rotan} />}
      {resto.length > 0 && abierto && resto.map(it => <div key={it.id}>{it.nodo}</div>)}
      {resto.length > 0 && (
        <button type="button" onClick={() => setAbierto(v => !v)} aria-expanded={abierto}
          className="block w-full border-b border-neutral-200 bg-neutral-50 py-1 text-center text-xs text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800">
          {abierto ? 'Ocultar avisos ▴' : `Ver ${resto.length === 1 ? '1 aviso más' : `${resto.length} avisos más`} ▾`}
        </button>
      )}
    </div>
  )
}

/** Las ofertas en un mismo lugar: apiladas en la misma celda (la altura es la de la más alta, no salta) y se ve una. */
function Rotador({ items }: { items: ItemAviso[] }) {
  const [i, setI] = useState(0)
  const [quieto, setQuieto] = useState(true)      // hasta saber si se puede mover (celular / reducir movimiento)
  // 21-11 (el dueño: «si abro la oferta y cambia sola a Radar, me quita la pantalla que estaba leyendo»): se pausa con el
  // mouse encima, con el foco adentro y, sobre todo, mientras haya una VENTANA abierta dentro del aviso (se cierra
  // solo con su ✕ / «Ahora no»). Un clic en el texto de la ventana no reactiva la rotación.
  // El foco se mira en el momento (al cerrarse la ventana, el navegador no avisa que el foco se fue).
  const encima = useRef(false)
  const caja = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let mover = false
    try { mover = !window.matchMedia('(prefers-reduced-motion: reduce)').matches && window.matchMedia('(min-width: 640px)').matches } catch { /* sin matchMedia: quieto */ }
    // Sin movimiento: una distinta en cada visita (contador en la pestaña).
    let n = 0
    try { n = Number(sessionStorage.getItem('avisos:rota') ?? 0) + 1; sessionStorage.setItem('avisos:rota', String(n)) } catch { /* nada */ }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- se decide en el navegador después de montar
    setI(n % items.length); setQuieto(!mover)
  }, [items.length])

  useEffect(() => {
    if (quieto || items.length < 2) return
    const t = setInterval(() => {
      const c = caja.current
      if (encima.current || document.hidden || (c && (c.contains(document.activeElement) || c.querySelector('[role="dialog"]')))) return
      setI(v => (v + 1) % items.length)
    }, CADA_MS)
    return () => clearInterval(t)
  }, [quieto, items.length])

  const actual = i % items.length
  if (items.length === 1) return <div>{items[0].nodo}</div>
  return (
    <div ref={caja} className="relative grid" aria-roledescription="carrusel"
      onMouseEnter={() => { encima.current = true }} onMouseLeave={() => { encima.current = false }}>
      {items.map((it, k) => (
        <div key={it.id} aria-hidden={k !== actual} inert={k !== actual}
          className={`col-start-1 row-start-1 transition-opacity duration-500 ease-out motion-reduce:transition-none ${k === actual ? 'opacity-100' : 'pointer-events-none opacity-0'}`}>
          {it.nodo}
        </div>
      ))}
      {!quieto && (
        <div className="pointer-events-none absolute bottom-[3px] left-1/2 flex -translate-x-1/2 gap-1" aria-hidden>
          {items.map((it, k) => <span key={it.id} className={`h-1 rounded-full transition-all duration-500 ${k === actual ? 'w-3 bg-neutral-500/70' : 'w-1 bg-neutral-400/50'}`} />)}
        </div>
      )}
    </div>
  )
}
