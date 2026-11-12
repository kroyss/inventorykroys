'use client'
import { useState } from 'react'
import { useConfirm } from '@/components/ui/ConfirmProvider'

// Modo Seguro / Modo Total (10-11-2026, el dueño): la respuesta automática con o sin modo seguro, independiente en Preguntas
// y en Mensajes. Se elige solo en Mi IA. En Modo Total sale también lo que iría a revisión (incluidos «Siempre una persona»
// y «Dejarla para una persona»); solo se respetan el horario y el máximo por comprador. En la base sigue siendo `todo`.
export const AVISO_TODO = 'La IA acierta cerca del 94 % de las preguntas cuando tu Mi IA está completo.'
export const MODO_TOTAL_DETALLE = 'En Modo Total la IA responde también lo que en Modo Seguro dejaría para revisar. Solo respeta tu horario y el máximo por comprador.'
export const nombreModo = (todo: boolean) => todo ? 'Modo Total' : 'Modo Seguro'

export function ResponderTodo({ tipo, todo, onCambio }: { tipo: 'preguntas' | 'mensajes'; todo: boolean; onCambio: () => void }) {
  const confirm = useConfirm()
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cambiar = async (v: boolean) => {
    if (v === todo) return
    if (v && !(await confirm({
      title: `Modo Total en ${tipo === 'preguntas' ? 'Preguntas' : 'Mensajes'}`,
      message: `${AVISO_TODO}\n\n${MODO_TOTAL_DETALLE}`,
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
  const op = (v: boolean, t: string, d: string) => (
    <button key={t} type="button" disabled={guardando} onClick={() => cambiar(v)}
      className={`text-left rounded-lg border px-3 py-2 disabled:opacity-60 ${todo === v ? 'border-neutral-900 ring-1 ring-neutral-900 bg-white' : 'border-neutral-200 bg-white hover:border-neutral-300'}`}>
      <span className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
        <span className={`w-3.5 h-3.5 rounded-full border ${todo === v ? 'border-neutral-900 bg-neutral-900 ring-2 ring-white ring-inset' : 'border-neutral-300'}`} />{t}</span>
      <span className="block mt-0.5 text-xs text-neutral-600">{d}</span>
    </button>
  )
  return (
    <div className="space-y-1">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        {op(false, 'Modo Seguro', 'Responde sola solo cuando está segura. Lo dudoso (reclamos, pagos, «no hay», temas de «Siempre una persona») te lo deja escrito para que lo revises y lo mandes tú.')}
        {op(true, 'Modo Total', tipo === 'preguntas'
          // 12-11 (el dueño): todo tiene respuesta; la posventa sale con la frase de escape (Frenos) y la sigues tú.
          ? `Responde todo sola. Lo de posventa (cancelar, devolver, reclamo) lo contesta con tu frase de escape para que tú sigas el caso. Respeta tu horario y el máximo por comprador. ${AVISO_TODO}`
          : `Responde todo sola, sin dejarte nada para revisar. Solo respeta tu horario y el máximo por comprador. ${AVISO_TODO}`)}
      </div>
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  )
}

/** Nota para corregir a la IA desde una respuesta: dato de ese producto (Datos del producto) o regla general (Mi IA). */
// 12-11 (el dueño): también desde el historial de Preguntas («✗ Corregir», al lado de «Respondió la IA»); al guardar avisa
// (onGuardado) para marcar esa respuesta como Mal.
export function NotaParaIA({ itemId, etiqueta = 'Corregir a la IA', onGuardado }: { itemId?: string | null; etiqueta?: string; onGuardado?: () => void }) {
  const [abierta, setAbierta] = useState(false)
  const [texto, setTexto] = useState('')
  const [donde, setDonde] = useState<'producto' | 'general'>(itemId ? 'producto' : 'general')
  const [estado, setEstado] = useState<string>('')
  if (!abierta) return <button type="button" onClick={() => setAbierta(true)} className="text-xs text-sky-700 hover:underline">{etiqueta}</button>
  const guardar = async () => {
    setEstado('guardando')
    const r = donde === 'producto'
      ? await fetch('/api/preguntas/notas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ item_id: itemId, texto: texto.trim() }) })
      : await fetch('/api/mi-ia/nota', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texto: texto.trim() }) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setEstado(d.error ?? 'No se pudo guardar'); return }
    setEstado('listo'); setTexto('')
    onGuardado?.()
  }
  if (estado === 'listo') return <p className="text-xs text-green-800">Guardado: la IA lo usa desde la próxima respuesta. {donde === 'producto' ? 'Está en Datos del producto de esta publicación.' : 'Está en Mi IA → Información extra → «Correcciones de mi equipo».'}</p>
  return (
    <div className="space-y-1.5 rounded-lg border border-neutral-200 bg-neutral-50 p-2">
      <p className="text-xs text-neutral-700"><b>¿En qué falló o qué debió decir?</b> La IA lo tiene en cuenta en las próximas.</p>
      {itemId && <div className="flex flex-wrap gap-1.5 text-xs">
        {([['producto', 'Dato de este producto'], ['general', 'Regla para todas']] as const).map(([k, t]) => (
          <button key={k} type="button" onClick={() => setDonde(k)}
            className={`px-2.5 py-1 rounded-full border ${donde === k ? 'bg-neutral-900 text-white border-neutral-900' : 'bg-white border-neutral-200 text-neutral-600'}`}>{t}</button>
        ))}
      </div>}
      <div className="flex flex-wrap sm:flex-nowrap gap-2">
        <input value={texto} onChange={e => setTexto(e.target.value)} maxLength={300}
          placeholder={donde === 'producto' ? 'Ej.: Sirve para cualquier vehículo. Envío gratis solo por TEALCA.' : 'Ej.: Si preguntan por Cashea, di que no y nombra nuestros medios de pago.'}
          className="flex-1 min-w-0 border border-neutral-300 rounded-lg px-2 py-1.5 text-sm" />
        <div className="flex gap-2">
          <button type="button" onClick={() => { setAbierta(false); setEstado('') }} className="px-3 py-1.5 rounded-lg text-sm text-neutral-600">Cancelar</button>
          <button type="button" onClick={guardar} disabled={texto.trim().length < 3 || estado === 'guardando'}
            className="px-3 py-1.5 rounded-lg bg-neutral-900 text-white text-sm disabled:opacity-50">{estado === 'guardando' ? '…' : 'Guardar'}</button>
        </div>
      </div>
      {estado && estado !== 'guardando' && <p className="text-xs text-red-700">{estado}</p>}
    </div>
  )
}
