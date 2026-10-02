'use client'
import { useState } from 'react'
import type { PreguntaPrevia } from '@/lib/preguntasComprador'

const fecha = (s: string) => new Date(s).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: '2-digit' })

/** Enlace chico "Preguntó antes (n)" que despliega, solo si se toca, las preguntas anteriores del
 *  mismo comprador (con su respuesta). `cargar` las pide recién al abrir; o vienen en `lista`. */
export function PreguntasPrevias({ n, lista, cargar, etiqueta = 'Preguntó antes' }: {
  n: number; lista?: PreguntaPrevia[]; cargar?: () => Promise<PreguntaPrevia[]>; etiqueta?: string
}) {
  const [abierto, setAbierto] = useState(false)
  const [cargadas, setDatos] = useState<PreguntaPrevia[] | null>(null)
  const datos = lista ?? cargadas
  if (n <= 0) return null
  const alternar = async () => {
    const abrir = !abierto
    setAbierto(abrir)
    if (abrir && !datos && cargar) setDatos(await cargar().catch(() => []))
  }
  return (
    <span className="contents">
      <button type="button" onClick={alternar} title="Preguntas anteriores de este comprador"
        className="text-xs text-sky-700 hover:underline underline-offset-2 whitespace-nowrap">
        ↺ {etiqueta} ({n}) {abierto ? '▴' : '▾'}
      </button>
      {abierto && (
        <div className="basis-full w-full mt-1 max-h-48 overflow-y-auto rounded-lg border border-neutral-200 bg-neutral-50/70 divide-y divide-neutral-200/70 text-xs">
          {!datos ? <p className="px-3 py-2 text-neutral-400">Cargando…</p> : datos.map(q => (
            <div key={q.id} className="px-3 py-1.5 space-y-0.5">
              <div className="flex items-baseline gap-2 text-neutral-400">
                <span className="num">{fecha(q.fecha)}</span>
                {q.item_titulo && (q.item_permalink
                  ? <a href={q.item_permalink} target="_blank" rel="noreferrer" className="truncate hover:underline underline-offset-2">{q.item_titulo} ↗</a>
                  : <span className="truncate">{q.item_titulo}</span>)}
              </div>
              <p className="text-neutral-800">{q.texto}</p>
              {q.respuesta && <p className="text-neutral-500">↳ {q.respuesta}</p>}
            </div>
          ))}
        </div>
      )}
    </span>
  )
}
