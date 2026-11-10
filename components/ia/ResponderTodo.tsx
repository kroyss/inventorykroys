'use client'
import { useState } from 'react'
import { useConfirm } from '@/components/ui/ConfirmProvider'

// «Responder todo» (10-11-2026, el dueño): la respuesta automática SIN modo seguro, independiente en Preguntas y en Mensajes.
// Con «Segura» (de fábrica) solo sale lo que la IA está segura; con «Responder todo» sale también lo que iría a revisión
// (solo se respetan los frenos del vendedor: horario y máximo por comprador).
export const AVISO_TODO = 'La IA acierta cerca del 94 % de las preguntas cuando tu Mi IA está completo.'

export function ResponderTodo({ tipo, todo, onCambio }: { tipo: 'preguntas' | 'mensajes'; todo: boolean; onCambio: () => void }) {
  const confirm = useConfirm()
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cambiar = async (v: boolean) => {
    if (v === todo) return
    if (v && !(await confirm({
      title: `Responder todo en ${tipo === 'preguntas' ? 'Preguntas' : 'Mensajes'}`,
      message: `${AVISO_TODO}\n\nCon «Responder todo» la IA responde también lo que hoy deja para revisar. Solo se respetan tus frenos (horario y máximo por comprador).`,
      confirmText: 'Entiendo, responder todo',
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
    <button type="button" disabled={guardando} onClick={() => cambiar(v)}
      className={`text-left rounded-lg border px-3 py-2 disabled:opacity-60 ${todo === v ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 bg-white hover:border-neutral-300'}`}>
      <div className="text-sm font-semibold">{t}</div>
      <div className={`text-xs ${todo === v ? 'text-neutral-300' : 'text-neutral-500'}`}>{d}</div>
    </button>
  )
  return (
    <div className="space-y-1.5">
      <div className="grid gap-2 sm:grid-cols-2">
        {op(false, 'Segura', 'Solo sale sola lo que la IA está segura. Lo demás te queda escrito para revisar.')}
        {op(true, 'Responder todo', 'Responde todo, sin modo seguro.')}
      </div>
      {todo && <p className="text-xs text-amber-800">{AVISO_TODO}</p>}
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  )
}

/** Nota para corregir a la IA desde una respuesta: dato de ese producto (Datos del producto) o regla general (Mi IA). */
export function NotaParaIA({ itemId }: { itemId?: string | null }) {
  const [abierta, setAbierta] = useState(false)
  const [texto, setTexto] = useState('')
  const [donde, setDonde] = useState<'producto' | 'general'>(itemId ? 'producto' : 'general')
  const [estado, setEstado] = useState<string>('')
  if (!abierta) return <button type="button" onClick={() => setAbierta(true)} className="text-xs text-sky-700 hover:underline">Corregir a la IA</button>
  const guardar = async () => {
    setEstado('guardando')
    const r = donde === 'producto'
      ? await fetch('/api/preguntas/notas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ item_id: itemId, texto: texto.trim() }) })
      : await fetch('/api/mi-ia/nota', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texto: texto.trim() }) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setEstado(d.error ?? 'No se pudo guardar'); return }
    setEstado('listo'); setTexto('')
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
      <div className="flex gap-2">
        <input value={texto} onChange={e => setTexto(e.target.value)} maxLength={300}
          placeholder={donde === 'producto' ? 'Ej.: Sirve para cualquier vehículo. Envío gratis solo por TEALCA.' : 'Ej.: Si preguntan por Cashea, di que no y nombra nuestros medios de pago.'}
          className="flex-1 min-w-0 border border-neutral-300 rounded-lg px-2 py-1.5 text-sm" />
        <button type="button" onClick={guardar} disabled={texto.trim().length < 3 || estado === 'guardando'}
          className="px-3 py-1.5 rounded-lg bg-neutral-900 text-white text-sm disabled:opacity-50">{estado === 'guardando' ? '…' : 'Guardar'}</button>
      </div>
      {estado && estado !== 'guardando' && <p className="text-xs text-red-700">{estado}</p>}
    </div>
  )
}
