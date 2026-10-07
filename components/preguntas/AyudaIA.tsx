'use client'
import { useEffect, useState } from 'react'

/** Avisa a <UsoIA /> que se pidió un borrador (para que actualice el contador). */
export const avisarUsoIA = () => window.dispatchEvent(new Event('uso-ia'))

/** Lo que cuesta cada botón, en créditos (ver cupoIA en lib/ia.ts). */
export const CREDITOS_TXT = '1 crédito'
export const CREDITOS_WEB_TXT = 'hasta 4 créditos'
const AYUDA_CREDITOS = 'Cada «Proponer con IA» usa 1 crédito, se use o no la respuesta. «Buscar en internet» usa 1 más 1 por cada búsqueda que haga (hasta 4). Las respuestas parecidas y las rápidas no gastan créditos. Se renuevan el día 1.'

/** Créditos de IA usados este mes. El cliente ve "usados de su límite"; el dueño de la plataforma
 *  (sin límite) ve además lo que costaron. */
export function UsoIA() {
  const [uso, setUso] = useState<{ total?: number; creditos: number; limite: number | null } | null>(null)
  useEffect(() => {
    let vivo = true
    const cargar = () => fetch('/api/ia/uso').then(r => r.ok ? r.json() : null).then(d => { if (vivo) setUso(d) })
    cargar()
    window.addEventListener('uso-ia', cargar)
    return () => { vivo = false; window.removeEventListener('uso-ia', cargar) }
  }, [])
  if (!uso) return null
  if (uso.limite !== null) {
    const quedan = Math.max(0, uso.limite - uso.creditos)
    return (
      <span className={`text-xs whitespace-nowrap ${quedan <= uso.limite * 0.1 ? 'text-amber-700' : 'text-neutral-500'}`}
        title={AYUDA_CREDITOS}>
        Créditos IA: <b className="num">{uso.creditos}</b> de {uso.limite} · te quedan <b className="num">{quedan}</b>
      </span>
    )
  }
  // Sin límite y sin costo (el costo solo llega al dueño de la plataforma): solo los créditos usados.
  if (uso.total === undefined) {
    return (
      <span className="text-xs text-neutral-500 whitespace-nowrap" title={AYUDA_CREDITOS}>
        Créditos IA usados este mes: <b className="text-neutral-800 num">{uso.creditos}</b>
      </span>
    )
  }
  const total = uso.total
  return (
    <span className="text-xs text-neutral-500 whitespace-nowrap" title={`Costo de la IA este mes. ${AYUDA_CREDITOS}`}>
      IA este mes: <b className="text-neutral-800 num">${total.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: total > 0 && total < 0.995 ? 4 : 2 })}</b>
      {' '}· {uso.creditos} crédito{uso.creditos === 1 ? '' : 's'}
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
