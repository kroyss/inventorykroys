'use client'
// Plataforma → ficha del cliente → Personas (13-11-2026, el dueño: un solo panel por cliente). Las personas de ESA empresa,
// una tarjeta cada una: usuario, rol, nombre, correo y cuándo entró; las acciones en el ⋯ (clave nueva, editar, desactivar,
// eliminar). Ya no hay tabla aparte de personas: el buscador de Clientes las encuentra por usuario, nombre o correo.
// Los «productos» por persona no se muestran: a qué entra cada cliente lo deciden los módulos de su empresa.
import { useCallback, useEffect, useState } from 'react'
import { RowMenu } from '@/components/ui'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import { hace } from './AdopcionPanel'

interface Persona {
  id: number
  username: string
  email: string | null
  whatsapp?: string | null
  full_name: string | null
  is_active: boolean
  entro: string | null
  empresas: { id: number; nombre: string; role: string }[]
}

function claveInicial() {
  const abc = 'abcdefghjkmnpqrstuvwxyz23456789'
  const r = crypto.getRandomValues(new Uint32Array(10))
  return Array.from(r, n => abc[n % abc.length]).join('')
}

const ROL: Record<string, string> = { admin: 'Administrador', user: 'Empleado' }

export default function PersonasEmpresa({ empresaId }: { empresaId: number }) {
  const confirmar = useConfirm()
  const [personas, setPersonas] = useState<Persona[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<{ id: number; texto: string; clave?: string } | null>(null)
  const [editando, setEditando] = useState<{ id: number; full_name: string; email: string } | null>(null)
  const [ocupado, setOcupado] = useState<number | null>(null)

  const cargar = useCallback(async () => {
    const r = await fetch(`/api/plataforma/cuentas?empresa=${empresaId}`).catch(() => null)
    const d = await r?.json().catch(() => ({}))
    if (!r?.ok) { setError(d?.error ?? 'No se pudieron cargar las personas'); setPersonas([]); return }
    setPersonas(d.cuentas)
  }, [empresaId])
  useEffect(() => { cargar() }, [cargar])

  const guardar = async (p: Persona, cambios: { email?: string; full_name?: string; is_active?: boolean; password?: string }) => {
    setOcupado(p.id); setError(null)
    const r = await fetch(`/api/plataforma/cuentas/${p.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cambios),
    }).catch(() => null)
    const d = await r?.json().catch(() => ({}))
    setOcupado(null)
    if (!r?.ok) { setError(d?.error ?? 'No se pudo guardar'); return false }
    await cargar()
    return true
  }

  const claveNueva = async (p: Persona) => {
    const ok = await confirmar({ title: `Restaurar la clave de ${p.username}`, message: 'Se le da una clave nueva: se cierran sus sesiones abiertas y tendrá que entrar con ella. La verás aquí una sola vez.', confirmText: 'Restaurar clave' })
    if (!ok) return
    const password = claveInicial()
    if (await guardar(p, { password })) setAviso({ id: p.id, texto: 'Clave nueva (pásasela por Telegram o WhatsApp privado; no se vuelve a mostrar):', clave: password })
  }

  const activar = async (p: Persona) => {
    if (p.is_active) {
      const ok = await confirmar({ title: `Desactivar a ${p.username}`, message: 'Ya no podrá entrar. Sus datos quedan y la puedes activar cuando quieras.', confirmText: 'Desactivar', danger: true })
      if (!ok) return
    }
    if (await guardar(p, { is_active: !p.is_active })) setAviso({ id: p.id, texto: p.is_active ? 'Desactivada: ya no puede entrar.' : 'Activada: ya puede entrar.' })
  }

  const eliminar = async (p: Persona) => {
    const otras = p.empresas.filter(e => e.id !== empresaId)
    const ok = await confirmar({
      title: `Eliminar a ${p.username}`, danger: true, confirmText: 'Eliminar',
      message: `No se puede deshacer.${otras.length ? `\nTambién sale de: ${otras.map(e => e.nombre).join(', ')}.` : ''}\nSolo se puede si no registró movimientos; si no, desactívala.`,
    })
    if (!ok) return
    setOcupado(p.id); setError(null)
    const r = await fetch(`/api/plataforma/cuentas/${p.id}`, { method: 'DELETE' }).catch(() => null)
    const d = await r?.json().catch(() => ({}))
    setOcupado(null)
    if (!r?.ok) { setError(d?.error ?? 'No se pudo eliminar'); return }
    cargar()
  }

  const guardarEdicion = async (p: Persona) => {
    if (!editando) return
    const cambios: { full_name?: string; email?: string } = {}
    if (editando.full_name.trim() && editando.full_name.trim() !== (p.full_name ?? '')) cambios.full_name = editando.full_name.trim()
    if (editando.email.trim() !== (p.email ?? '')) cambios.email = editando.email.trim()
    if (!Object.keys(cambios).length) { setEditando(null); return }
    if (await guardar(p, cambios)) { setEditando(null); setAviso({ id: p.id, texto: 'Guardado.' }) }
  }

  if (!personas) return <div className="h-16 animate-pulse rounded-lg bg-neutral-100" />

  return (
    <div className="space-y-2">
      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
      {!personas.length && !error && <p className="text-xs text-neutral-400">Sin personas.</p>}
      {personas.map(p => {
        const rol = p.empresas.find(e => e.id === empresaId)?.role
        const otras = p.empresas.filter(e => e.id !== empresaId)
        const edita = editando?.id === p.id
        return (
          <div key={p.id} className={`rounded-xl border bg-white p-3 ${p.is_active ? 'border-neutral-200' : 'border-dashed border-neutral-300 bg-neutral-50'} ${ocupado === p.id ? 'opacity-60' : ''}`}>
            <div className="flex items-start gap-3">
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold uppercase ${p.is_active ? 'bg-lime-100 text-lime-800' : 'bg-neutral-200 text-neutral-500'}`} aria-hidden>
                {(p.full_name ?? p.username).slice(0, 1)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="truncate font-medium text-neutral-900">{p.full_name ?? p.username}</span>
                  {rol && <span className="rounded-full bg-neutral-100 px-2 py-px text-[10px] font-medium text-neutral-600">{ROL[rol] ?? rol}</span>}
                  {!p.is_active && <span className="rounded-full bg-neutral-200 px-2 py-px text-[10px] font-medium text-neutral-600">Desactivada</span>}
                </div>
                <p className="truncate font-mono text-xs text-neutral-500">{p.username}</p>
                <p className="truncate text-xs text-neutral-500">{p.email ?? <span className="text-amber-700">sin correo (no puede recuperar la clave)</span>}</p>
                {p.whatsapp && <a href={`https://wa.me/${p.whatsapp.replace(/\D/g, '').replace(/^0/, '58')}`} target="_blank" rel="noreferrer" className="block truncate text-xs font-medium text-emerald-700 hover:underline">WhatsApp {p.whatsapp}</a>}
                <p className="text-[11px] text-neutral-400">
                  {p.entro ? `Entró ${hace(p.entro)}` : 'Nunca entró'}
                  {otras.length > 0 && ` · también en ${otras.map(e => e.nombre).join(', ')}`}
                </p>
              </div>
              {/* Lo delicado o poco usado, en el ⋯; lo de todos los días va a la vista abajo. */}
              <RowMenu items={[
                { label: p.is_active ? 'Desactivar' : 'Activar', onClick: () => activar(p) },
                { label: 'Eliminar…', onClick: () => eliminar(p), danger: true },
              ]} />
            </div>
            {!edita && (
              <div className="mt-2.5 flex flex-wrap gap-2 pl-12">
                <button type="button" onClick={() => claveNueva(p)} disabled={ocupado === p.id}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-2.5 py-1 text-xs font-medium text-neutral-800 hover:bg-neutral-50 disabled:opacity-50">
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><circle cx="8" cy="15" r="4" /><path d="m10.8 12.2 9.2-9.2M17 6l3 3M14 9l2 2" /></svg>
                  Restaurar clave
                </button>
                <button type="button" onClick={() => { setAviso(null); setEditando({ id: p.id, full_name: p.full_name ?? '', email: p.email ?? '' }) }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-2.5 py-1 text-xs font-medium text-neutral-800 hover:bg-neutral-50">
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                  Editar nombre y correo
                </button>
              </div>
            )}

            {edita && editando && (
              <form onSubmit={e => { e.preventDefault(); guardarEdicion(p) }} className="mt-3 space-y-2 border-t border-neutral-100 pt-3">
                <label className="block text-[11px] text-neutral-500">Nombre
                  <input autoFocus value={editando.full_name} onChange={e => setEditando({ ...editando, full_name: e.target.value })}
                    className="mt-0.5 w-full rounded-lg border border-neutral-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-800" />
                </label>
                <label className="block text-[11px] text-neutral-500">Correo (para recuperar la clave)
                  <input type="email" value={editando.email} onChange={e => setEditando({ ...editando, email: e.target.value })} placeholder="vacío = sin correo"
                    className="mt-0.5 w-full rounded-lg border border-neutral-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-800" />
                </label>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setEditando(null)} className="btn-secondary text-xs">Cancelar</button>
                  <button type="submit" disabled={ocupado === p.id} className="btn-primary text-xs">{ocupado === p.id ? 'Guardando…' : 'Guardar'}</button>
                </div>
              </form>
            )}

            {aviso?.id === p.id && (
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-lime-200 bg-lime-50 px-3 py-2 text-xs text-lime-900">
                <span className="min-w-0 flex-1">{aviso.texto}</span>
                {aviso.clave && <>
                  <code className="rounded bg-white px-2 py-0.5 font-mono text-sm text-neutral-900 ring-1 ring-lime-200">{aviso.clave}</code>
                  <button type="button" onClick={() => navigator.clipboard?.writeText(aviso.clave!).catch(() => {})} className="font-medium underline">Copiar</button>
                </>}
                <button type="button" onClick={() => setAviso(null)} className="text-lime-700 hover:text-lime-900" aria-label="Cerrar">✕</button>
              </div>
            )}
          </div>
        )
      })}
      <p className="text-[11px] text-neutral-400">Agregar personas o cambiar su rol lo hace el administrador del cliente en su pantalla Usuarios.</p>
    </div>
  )
}
