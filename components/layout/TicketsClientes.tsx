'use client'
import { useCallback, useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'

// 27-11 (el dueño): los tickets de clientes se responden DESDE el botón de Ayuda, sin salir de la pantalla
// (la bandeja completa sigue en Plataforma → Soporte). Lista de los sin resolver → el caso: conversación, responder,
// marcar resuelto y «Ver como» (entra a la cuenta del cliente en la pantalla donde escribió; al volver, regresa a
// donde estabas con el ticket abierto: VOLVER_TICKET, lo lee VerComoBarra y BurbujaAyuda). Usa las APIs de Plataforma.
export const VOLVER_TICKET = 'soporte_volver_ticket'
export function leerVolverTicket(): { id: number; ruta: string } | null {
  try { const v = sessionStorage.getItem(VOLVER_TICKET); return v ? JSON.parse(v) : null } catch { return null }
}
export function borrarVolverTicket() { try { sessionStorage.removeItem(VOLVER_TICKET) } catch { /* sin almacenamiento */ } }

interface Mensaje { id: number; autor: 'cliente' | 'soporte'; texto: string; adjuntos: string[]; created_at: string }
interface Caso { id: number; origen: string; estado: 'abierto' | 'respondido' | 'resuelto'; pantalla: string | null; updated_at: string
  user_id: number | null; empresa_id: number | null; persona: string | null; empresa: string | null; mensajes: Mensaje[] }
const ORIGEN: Record<string, string> = { sistema: 'Sistema', radar: 'Radar' }
const hora = (s: string) => new Date(s).toLocaleString('es-VE', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'America/Caracas' })

export default function TicketsClientes({ inicial, onCambio }: { inicial: number | null; onCambio: () => void }) {
  const { update } = useSession()
  const [casos, setCasos] = useState<Caso[] | null>(null)
  const [abierto, setAbierto] = useState<number | null>(inicial)
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [entrando, setEntrando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cargar = useCallback(async () => {
    const r = await fetch('/api/plataforma/casos-soporte?tickets=1', { cache: 'no-store' }).catch(() => null)
    const d = await r?.json().catch(() => null)
    setCasos(d?.casos ?? [])
  }, [])
  useEffect(() => { void cargar() }, [cargar])

  async function responder(id: number) {
    if (!texto.trim() || enviando) return
    setEnviando(true); setError(null)
    const r = await fetch(`/api/plataforma/casos-soporte/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texto }) }).catch(() => null)
    const d = await r?.json().catch(() => null)
    setEnviando(false)
    if (!r?.ok) { setError(d?.error ?? 'No se pudo enviar'); return }
    setTexto(''); await cargar(); onCambio()
  }
  async function resolver(id: number) {
    await fetch(`/api/plataforma/casos-soporte/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ estado: 'resuelto' }) }).catch(() => {})
    setAbierto(null); await cargar(); onCambio()
  }
  async function verComo(c: Caso) {
    if (!c.empresa_id || !c.user_id) return
    setEntrando(true)
    try { sessionStorage.setItem(VOLVER_TICKET, JSON.stringify({ id: c.id, ruta: location.pathname + location.search })) } catch { /* sin almacenamiento */ }
    await update({ soporte: { empresaId: c.empresa_id, usuarioId: c.user_id } }).catch(() => null)
    window.location.assign(c.pantalla && c.pantalla.startsWith('/') && !c.pantalla.startsWith('/plataforma') ? c.pantalla : '/')
  }

  if (!casos) return <p className="text-neutral-500">Cargando tickets…</p>
  const caso = casos.find(c => c.id === abierto)
  if (caso) return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <button onClick={() => { setAbierto(null); setError(null) }} className="py-1 text-xs text-neutral-500 hover:text-neutral-800">← Tickets de clientes</button>
        {caso.empresa_id && caso.user_id && caso.origen === 'sistema' && (
          <button onClick={() => verComo(caso)} disabled={entrando}
            className="rounded-full border border-neutral-300 px-2.5 py-1 text-xs font-medium text-neutral-700 hover:border-lime-500 hover:text-neutral-900 disabled:opacity-60">
            {entrando ? 'Entrando…' : '👁 Ver como'}
          </button>
        )}
      </div>
      <div className="rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-500">
        <p className="font-medium text-neutral-800">{caso.empresa ?? 'Sin empresa'} · {caso.persona ?? 'Cliente'}</p>
        <p className="truncate">Caso #{caso.id} · {ORIGEN[caso.origen] ?? caso.origen}{caso.pantalla ? ` · ${caso.pantalla}` : ''} · {caso.estado === 'abierto' ? 'por responder' : 'respondido'}</p>
      </div>
      {caso.mensajes.map(m => (
        <div key={m.id} className={m.autor === 'soporte' ? 'ml-auto max-w-[88%]' : 'max-w-[92%]'}>
          <div className={`rounded-2xl px-3 py-2 space-y-1 whitespace-pre-wrap break-words ${m.autor === 'soporte' ? 'rounded-br-sm bg-neutral-900 text-white' : 'rounded-bl-sm bg-neutral-100 text-neutral-800'}`}>
            {m.texto}
            {m.adjuntos.map(a => (
              <a key={a} href={`/api/soporte/adjunto?caso=${caso.id}&archivo=${encodeURIComponent(a)}`} target="_blank" rel="noreferrer"
                className={`block text-xs underline underline-offset-2 ${m.autor === 'soporte' ? 'text-lime-300' : 'text-lime-800'}`}>📎 {a.endsWith('.pdf') ? 'PDF adjunto' : 'Captura'}</a>
            ))}
          </div>
          <p className={`mt-0.5 text-[11px] text-neutral-400 ${m.autor === 'soporte' ? 'text-right' : ''}`}>{m.autor === 'soporte' ? 'Tú · ' : ''}{hora(m.created_at)}</p>
        </div>
      ))}
      <div className="sticky -bottom-3 -mx-4 -mb-3 space-y-2 border-t border-neutral-100 bg-white px-4 py-3">
        <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={2} maxLength={4000} placeholder="Escribe la respuesta…"
          onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void responder(caso.id) }}
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-base sm:text-sm focus:outline-none focus:border-lime-600 focus:ring-2 focus:ring-lime-400/40" />
        <div className="flex items-center justify-between gap-2">
          <button onClick={() => resolver(caso.id)} className="btn-secondary text-xs">✓ Marcar resuelto</button>
          <button onClick={() => responder(caso.id)} disabled={enviando || !texto.trim()} className="btn-primary text-sm">{enviando ? 'Enviando…' : 'Responder'}</button>
        </div>
        {error && <p className="text-red-600 text-xs">{error}</p>}
      </div>
    </div>
  )
  const porResponder = casos.filter(c => c.estado === 'abierto').length
  return (
    <div className="space-y-1.5">
      <p className="font-medium text-neutral-800">Tickets de clientes{porResponder > 0 && <span className="ml-1.5 text-xs font-semibold text-red-600">· {porResponder} por responder</span>}</p>
      {!casos.length && <p className="rounded-lg bg-neutral-50 px-3 py-4 text-center text-xs text-neutral-500">No hay tickets abiertos. 🎉</p>}
      {casos.map(c => {
        const ult = c.mensajes[c.mensajes.length - 1]
        return (
          <button key={c.id} onClick={() => { setAbierto(c.id); setError(null) }}
            className={`block w-full text-left rounded-lg border px-3 py-2 hover:border-lime-400 ${c.estado === 'abierto' ? 'border-red-200 bg-red-50/40' : 'border-neutral-200'}`}>
            <span className="flex items-center justify-between gap-2 text-xs text-neutral-500">
              <span className="truncate">#{c.id} · {c.empresa ?? 'Sin empresa'} · {hora(c.updated_at)}</span>
              <span className={c.estado === 'abierto' ? 'font-semibold text-red-600 shrink-0' : 'text-lime-700 shrink-0'}>{c.estado === 'abierto' ? '● por responder' : 'respondido'}</span>
            </span>
            <span className="mt-0.5 block truncate text-neutral-800">{ult?.autor === 'soporte' ? `Tú: ${ult.texto}` : ult?.texto || 'Captura'}</span>
          </button>
        )
      })}
    </div>
  )
}
