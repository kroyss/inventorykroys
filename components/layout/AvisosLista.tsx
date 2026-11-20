'use client'
import { useEffect, useState, type ReactNode } from 'react'

// «Avisos de tu cuenta» (20-11, el dueño; idea vista en Mercasist): las franjas de arriba (vencimiento / prueba / corte,
// cuenta de ML desconectada, créditos de IA, Radar PRO) salen juntas en un solo recuadro: se ve el aviso más importante y
// el resto queda en «Ver N avisos más». Los ROJOS nunca se esconden (si hay dos, se ven los dos). Cada aviso sale en las
// mismas condiciones que antes; solo cambia cómo se agrupan. Los arma AvisosArriba (servidor).
export type NivelAviso = 'rojo' | 'ambar' | 'verde' | 'gris' | 'info'
export interface ItemAviso {
  id: string
  nivel: NivelAviso
  orden: number          // menor = más importante
  nodo: ReactNode        // la franja tal como se veía antes
  cerrar?: string        // llave del navegador con la que el aviso se cierra solo (Radar PRO): cerrado no se cuenta
}

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
  const rojos = lista.filter(it => it.nivel === 'rojo')
  const principales = rojos.length ? rojos : lista.slice(0, 1)
  const resto = lista.filter(it => !principales.includes(it))

  return (
    <div role="region" aria-label="Avisos de tu cuenta">
      {principales.map(it => <div key={it.id}>{it.nodo}</div>)}
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
