'use client'
import { useState } from 'react'
import { useConfirm } from '@/components/ui/ConfirmProvider'

// Modo Seguro / Modo Total (10-11-2026, el dueño): la respuesta automática con o sin modo seguro, independiente en Preguntas
// y en Mensajes. Se elige solo en Mi IA. En Modo Total sale también lo que iría a revisión (incluidos «Siempre una persona»
// y «Dejarla para una persona»); solo se respetan el horario y el máximo por comprador. En la base sigue siendo `todo`.
export const AVISO_TODO = 'La IA acierta cerca del 94 % de las preguntas cuando tu Mi IA está completo.'
export const MODO_TOTAL_DETALLE = 'En Modo Total la IA responde también lo que en Modo Seguro dejaría para revisar. Solo respeta tu horario y el máximo por comprador.'
// 27-11 (el dueño): en Mensajes la posventa no la escribe la IA ni en Modo Total: sale la frase de escape con tu contacto.
const AVISO_TOTAL_MENSAJES = 'La IA responde sola casi todo. En garantías, reclamos, devoluciones o pedidos distintos a lo publicado no responde ella: manda siempre tu frase de escape y te deja la conversación en «Por atender». Pon en esa frase un contacto directo (WhatsApp o teléfono) para que el comprador te escriba.\n\nOjo: en Modo Total salen solos también pagos, datos y dudas que en Modo Seguro revisaría una persona.'
// 27-11 (el dueño): el % de acierto también en Modo Seguro (da confianza). Marcas Bien/Mal de lo que salió solo
// (preguntas 90 días: 30/2; mensajes 30 días: 477/12).
const ACIERTO_SEGURO = { preguntas: 94, mensajes: 97 } as const
export const nombreModo = (todo: boolean) => todo ? 'Modo Total' : 'Modo Seguro'

export function ResponderTodo({ tipo, todo, onCambio, soloSeguro = false }: { tipo: 'preguntas' | 'mensajes'; todo: boolean; onCambio: () => void
  /** 27-11 (el dueño): Mensajes para clientes, solo Modo Seguro por ahora. */
  soloSeguro?: boolean }) {
  const confirm = useConfirm()
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cambiar = async (v: boolean) => {
    if (v === todo) return
    if (v && !(await confirm({
      title: `Modo Total en ${tipo === 'preguntas' ? 'Preguntas' : 'Mensajes'}`,
      message: tipo === 'preguntas' ? `${AVISO_TODO}\n\n${MODO_TOTAL_DETALLE}` : AVISO_TOTAL_MENSAJES,
      confirmText: 'Entiendo, usar Modo Total',
    }))) return
    setGuardando(true); setError(null)
    const r = tipo === 'preguntas'
      ? await fetch('/api/preguntas/ia-auto', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion: 'todo', todo: v }) })
      : await fetch('/api/mensajes/ia-prueba', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ todo: v }) })
    setGuardando(false)
    if (!r.ok) { setError((await r.json().catch(() => null))?.error ?? 'No se pudo cambiar'); return }
    onCambio()
  }
  const op = (v: boolean, t: string, d: string, acierto?: string) => (
    <button key={t} type="button" disabled={guardando} onClick={() => cambiar(v)}
      className={`text-left rounded-lg border px-3 py-2 disabled:opacity-60 ${todo === v ? 'border-neutral-900 ring-1 ring-neutral-900 bg-white' : 'border-neutral-200 bg-white hover:border-neutral-300'}`}>
      <span className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
        <span className={`w-3.5 h-3.5 rounded-full border ${todo === v ? 'border-neutral-900 bg-neutral-900 ring-2 ring-white ring-inset' : 'border-neutral-300'}`} />{t}</span>
      <span className="block mt-0.5 text-xs text-neutral-600">{d}{acierto && <> <b className="font-semibold text-emerald-700">{acierto}</b></>}</span>
    </button>
  )
  if (soloSeguro) return (
    <div className="rounded-lg border border-neutral-900 ring-1 ring-neutral-900 bg-white px-3 py-2">
      <span className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
        <span className="w-3.5 h-3.5 rounded-full border border-neutral-900 bg-neutral-900 ring-2 ring-white ring-inset" />Modo Seguro</span>
      <span className="block mt-0.5 text-xs text-neutral-600">Responde sola solo cuando está segura. Lo dudoso (reclamos, pagos, «no hay», temas de «Siempre una persona») te lo deja escrito en «Por atender» para que lo revises y lo mandes tú. <b className="font-semibold text-emerald-700">Lo que manda sola acierta cerca del {ACIERTO_SEGURO[tipo]} %.</b></span>
    </div>
  )
  return (
    <div className="space-y-1">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        {op(false, 'Modo Seguro', 'Responde sola solo cuando está segura. Lo dudoso (reclamos, pagos, «no hay», temas de «Siempre una persona») te lo deja escrito para que lo revises y lo mandes tú.', `Lo que manda sola acierta cerca del ${ACIERTO_SEGURO[tipo]} %.`)}
        {op(true, 'Modo Total', tipo === 'preguntas'
          // 12-11 (el dueño): todo tiene respuesta; la posventa sale con la frase de escape (Frenos) y la sigues tú.
          ? `Responde todo sola. Lo de posventa (cancelar, devolver, reclamo) lo contesta con tu frase de escape para que tú sigas el caso. Respeta tu horario y el máximo por comprador. ${AVISO_TODO}`
          : 'Responde todo sola. En garantías, reclamos, devoluciones o pedidos distintos a lo publicado manda siempre tu frase de escape (recomendado: tu contacto directo) y te lo deja en «Por atender». Respeta tu horario y el máximo por comprador.')}
      </div>
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  )
}

