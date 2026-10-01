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

/** Lo que ya respondiste a algo parecido (gratis, sin IA), en UNA fila de chips compactos:
 *  el texto completo y la pregunta original salen al pasar el mouse; un clic y queda en el cuadro. */
export function Sugerencias({ lista, onUsar, etiqueta }: { lista: Sugerencia[]; onUsar: (texto: string) => void; etiqueta: string }) {
  if (!lista.length) return null
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <span className="text-xs text-neutral-400 shrink-0" title="Respuestas tuyas a preguntas parecidas · gratis, sin IA">{etiqueta}</span>
      <div className="flex gap-1.5 min-w-0 overflow-x-auto [scrollbar-width:none]">
        {lista.map((s, i) => (
          <button key={i} type="button" onClick={() => onUsar(s.respuesta)}
            title={`${s.respuesta}\n\n— a “${s.pregunta}”${s.mismaPublicacion ? ' (misma publicación)' : s.titulo ? ` (${s.titulo})` : ''} · ${Math.round(s.parecido * 100)}% parecida`}
            className="shrink-0 max-w-[16rem] truncate px-2.5 py-1 text-xs rounded-full border border-lime-200 bg-lime-50/60 text-neutral-700 hover:border-lime-400 hover:bg-lime-100 transition-colors">
            {s.mismaPublicacion && <span className="text-lime-700">● </span>}{s.respuesta}
          </button>
        ))}
      </div>
    </div>
  )
}
