'use client'
import { useEffect, useState } from 'react'

/** Lo gastado en IA este mes (solo lo ve un administrador; a los demás no les aparece). */
export function UsoIA() {
  const [uso, setUso] = useState<{ total: number; borradores: number } | null>(null)
  useEffect(() => {
    let vivo = true
    fetch('/api/ia/uso').then(r => r.ok ? r.json() : null).then(d => { if (vivo) setUso(d) })
    return () => { vivo = false }
  }, [])
  if (!uso) return null
  return (
    <span className="text-xs text-neutral-500 whitespace-nowrap" title="Costo de los borradores de la IA en Preguntas y Mensajes este mes">
      IA este mes: <b className="text-neutral-800 num">${uso.total.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b>
      {' '}· {uso.borradores} borrador{uso.borradores === 1 ? '' : 'es'}
    </span>
  )
}

export interface Sugerencia { pregunta: string; respuesta: string; parecido: number; mismaPublicacion?: boolean; titulo?: string | null }

/** Lo que ya respondiste a algo parecido (gratis, sin IA): un clic y queda en el cuadro de texto. */
export function Sugerencias({ lista, onUsar, etiqueta }: { lista: Sugerencia[]; onUsar: (texto: string) => void; etiqueta: string }) {
  if (!lista.length) return null
  return (
    <div className="space-y-1.5">
      <p className="text-xs text-neutral-400">{etiqueta} <span className="text-neutral-300">· gratis, sin IA</span></p>
      {lista.map((s, i) => (
        <button key={i} type="button" onClick={() => onUsar(s.respuesta)}
          title={`Pregunta parecida: "${s.pregunta}"`}
          className="w-full text-left rounded-lg border border-neutral-200 hover:border-lime-400 hover:bg-lime-50/50 px-3 py-2 transition-colors group">
          <span className="block text-sm text-neutral-800 line-clamp-2">{s.respuesta}</span>
          <span className="block text-[11px] text-neutral-400 mt-0.5 truncate">
            a “{s.pregunta}”
            {s.mismaPublicacion ? ' · misma publicación' : s.titulo ? ` · ${s.titulo}` : ''}
            {' '}· {Math.round(s.parecido * 100)}% parecida
            <span className="text-lime-700 font-medium ml-2 opacity-0 group-hover:opacity-100">Usar</span>
          </span>
        </button>
      ))}
    </div>
  )
}
