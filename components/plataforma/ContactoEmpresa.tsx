'use client'
// Plataforma → ficha del cliente → Contacto (13-11-2026, el dueño): todo lo que dejó el registro, para leer, y su
// WhatsApp / Telegram editables (también para las cuentas creadas a mano, que no traen nada). Se guarda en
// organizaciones.registro (JSON). El correo para recuperar la clave NO va aquí: vive en la Persona (un solo lugar).
import { useState, type FormEvent } from 'react'

export interface Registro {
  correo?: string | null; whatsapp?: string | null; telegram?: string | null
  promo?: string | null; navegador?: string | null
}

const ORIGEN: Record<string, string> = {
  autoregistro: 'Se registró solo (prueba 15 días)',
  radar: 'Se registró desde el Radar',
}

const fechaCorta = (s: string | null) => {
  if (!s) return ''
  const [a, m, d] = s.split('-')
  return `${d}/${m}/${a}`
}

/** «Android · Chrome», «iPhone · Safari»… (el texto completo queda en el title). */
function equipo(ua: string) {
  const so = /iPhone|iPad/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows'
    : /Mac OS/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'Otro'
  const nav = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /SamsungBrowser/.test(ua) ? 'Samsung'
    : /Firefox|FxiOS/.test(ua) ? 'Firefox' : /Chrome|CriOS/.test(ua) ? 'Chrome' : /Safari/.test(ua) ? 'Safari' : ''
  return nav ? `${so} · ${nav}` : so
}

const waLink = (n: string) => `https://wa.me/${n.replace(/\D/g, '').replace(/^0/, '58')}`

export default function ContactoEmpresa({ empresaId, registro, origen, creada, onGuardado, onError }: {
  empresaId: number; registro: Registro | null | undefined; origen: string | null | undefined; creada: string | null
  onGuardado: (msg: string) => void; onError: (msg: string) => void
}) {
  const r = registro ?? {}
  const [editando, setEditando] = useState<{ whatsapp: string; telegram: string } | null>(null)
  const [guardando, setGuardando] = useState(false)

  const guardar = async (ev: FormEvent) => {
    ev.preventDefault()
    if (!editando) return
    setGuardando(true)
    const res = await fetch(`/api/plataforma/empresas/${empresaId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contacto: { whatsapp: editando.whatsapp.trim(), telegram: editando.telegram.trim() } }),
    }).catch(() => null)
    const d = await res?.json().catch(() => ({}))
    setGuardando(false)
    if (!res?.ok) { onError(d?.error ?? 'No se pudo guardar el contacto'); return }
    setEditando(null); onGuardado('Contacto guardado.')
  }

  const fila = (etiqueta: string, valor: React.ReactNode) => (
    <div className="flex items-baseline gap-3 py-1.5">
      <dt className="w-24 shrink-0 text-[11px] text-neutral-500">{etiqueta}</dt>
      <dd className="min-w-0 flex-1 break-words text-sm text-neutral-800">{valor}</dd>
    </div>
  )
  const vacio = <span className="text-neutral-400">—</span>
  const campo = 'mt-0.5 w-full rounded-lg border border-neutral-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-800'

  return (
    <div className="rounded-xl border border-neutral-200 p-3">
      {!editando ? (
        <>
          <dl className="divide-y divide-neutral-100">
            {fila('WhatsApp', r.whatsapp
              ? <a href={waLink(r.whatsapp)} target="_blank" rel="noreferrer" className="font-medium text-emerald-700 hover:underline">{r.whatsapp}</a>
              : vacio)}
            {fila('Telegram', r.telegram
              ? <a href={`https://t.me/${r.telegram}`} target="_blank" rel="noreferrer" className="font-medium text-sky-700 hover:underline">@{r.telegram}</a>
              : vacio)}
            {r.correo && fila('Correo', <span title="El que escribió al registrarse. El de recuperar la clave está en Personas.">{r.correo}</span>)}
            {fila('Llegó', <>{(origen && ORIGEN[origen]) ?? 'La creaste tú'}{creada && <span className="text-neutral-500"> · {fechaCorta(creada)}</span>}</>)}
            {r.promo && fila('Promo', <span className="font-mono text-xs">{r.promo}</span>)}
            {r.navegador && fila('Equipo', <span title={r.navegador}>{equipo(r.navegador)}</span>)}
          </dl>
          <button type="button" onClick={() => setEditando({ whatsapp: r.whatsapp ?? '', telegram: r.telegram ?? '' })}
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-2.5 py-1 text-xs font-medium text-neutral-800 hover:bg-neutral-50">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
            Editar WhatsApp y Telegram
          </button>
        </>
      ) : (
        <form onSubmit={guardar} className="space-y-2">
          <label className="block text-[11px] text-neutral-500">WhatsApp
            <input autoFocus inputMode="tel" value={editando.whatsapp} onChange={e => setEditando({ ...editando, whatsapp: e.target.value })}
              placeholder="0412 1234567" className={campo} />
          </label>
          <label className="block text-[11px] text-neutral-500">Telegram (usuario, sin @)
            <input value={editando.telegram} autoCapitalize="none" spellCheck={false}
              onChange={e => setEditando({ ...editando, telegram: e.target.value.replace(/^@/, '') })} placeholder="usuario" className={campo} />
          </label>
          <p className="text-[11px] text-neutral-400">Vacío = sin ese dato.</p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setEditando(null)} className="btn-secondary text-xs">Cancelar</button>
            <button type="submit" disabled={guardando} className="btn-primary text-xs">{guardando ? 'Guardando…' : 'Guardar'}</button>
          </div>
        </form>
      )}
    </div>
  )
}
