'use client'
import { useCallback, useEffect, useState } from 'react'
import { signOut } from 'next-auth/react'
import { PageHeader } from '@/components/ui'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import type { Country } from '@/lib/types'

interface Usuario {
  id: number; username: string; full_name: string | null; role: 'admin' | 'user'
  is_active: boolean; created_at: string | null; last_login: string | null
}

const PASSWORD_MIN = 8
const fecha = (s: string | null) => s
  ? new Date(s).toLocaleString('es-VE', { timeZone: 'America/Caracas', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
  : 'nunca'

// Contraseña legible para dictar/escribir (sin 0/O/1/l/I).
function generarPassword() {
  const abc = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const buf = new Uint32Array(10)
  crypto.getRandomValues(buf)
  return Array.from(buf, n => abc[n % abc.length]).join('')
}

const ROL_TXT = { admin: 'Admin (todo)', user: 'Usuario (ventas, despachos, inventario, recepciones)' }

export default function UsuariosClient({ country }: { country: Country }) {
  const confirm = useConfirm()
  const [users, setUsers] = useState<Usuario[]>([])
  const [me, setMe]       = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [nuevo, setNuevo] = useState(false)
  const [claveDe, setClaveDe] = useState<Usuario | null>(null)

  const cargar = useCallback(() => fetch('/api/users').then(async r => {
    const d = await r.json()
    if (!r.ok) { setError(d.error ?? 'Error'); return }
    setUsers(d.users); setMe(d.me)
  }), [])
  useEffect(() => { cargar() }, [cargar])

  const actualizar = async (u: Usuario, cambios: Partial<Pick<Usuario, 'role' | 'is_active' | 'full_name'>>, msg: string) => {
    setError(null); setAviso(null)
    const r = await fetch(`/api/users/${u.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cambios),
    })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setError(d.error ?? 'Error'); return }
    setAviso(msg); cargar()
  }

  const toggleActivo = async (u: Usuario) => {
    if (u.is_active && !await confirm({
      title: 'Desactivar usuario',
      message: `${u.full_name ?? u.username} no podrá entrar más y se cierran sus sesiones abiertas. Su historial (ventas, lotes) se conserva.`,
      confirmText: 'Desactivar', danger: true,
    })) return
    actualizar(u, { is_active: !u.is_active },
      u.is_active ? `${u.username} desactivado: sus sesiones abiertas se cerraron.` : `${u.username} activado.`)
  }

  const cambiarRol = async (u: Usuario, role: Usuario['role']) => {
    if (role === u.role) return
    if (!await confirm({
      title: 'Cambiar rol',
      message: `${u.username} pasa a ${ROL_TXT[role]}. Tendrá que volver a entrar.`,
      confirmText: 'Cambiar',
    })) return
    actualizar(u, { role }, `Rol de ${u.username} actualizado.`)
  }

  const renombrar = async (u: Usuario) => {
    const nombre = window.prompt('Nombre completo', u.full_name ?? '')?.trim()
    if (!nombre || nombre === u.full_name) return
    actualizar(u, { full_name: nombre }, 'Nombre actualizado.')
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Usuarios"
        subtitle={`Quién puede entrar al sistema (${country}). Cada país tiene sus propios usuarios.`}
        actions={<button onClick={() => { setNuevo(true); setError(null) }} className="btn-primary text-sm">+ Nuevo usuario</button>}
      />

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded text-sm">{error}</div>}
      {aviso && <div className="bg-blue-50 border border-blue-200 text-blue-800 px-4 py-2 rounded text-sm">{aviso}</div>}

      {nuevo && <NuevoUsuario onCancelar={() => setNuevo(false)} onCreado={(msg) => { setNuevo(false); setAviso(msg); cargar() }} />}
      {claveDe && (
        <CambiarClave u={claveDe} esYo={claveDe.id === me}
          onCancelar={() => setClaveDe(null)}
          onListo={(msg, yo) => {
            setClaveDe(null)
            if (yo) { signOut({ callbackUrl: '/login' }); return }
            setAviso(msg)
          }} />
      )}

      <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-xs text-neutral-500">
            <tr>
              <th className="px-4 py-2 text-left">Usuario</th>
              <th className="px-4 py-2 text-left">Nombre</th>
              <th className="px-4 py-2 text-left">Rol</th>
              <th className="px-4 py-2 text-left">Último ingreso</th>
              <th className="px-4 py-2 text-left">Estado</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {users.map(u => {
              const yo = u.id === me
              return (
                <tr key={u.id} className={`border-t border-neutral-100 ${!u.is_active ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-2 font-mono">{u.username}{yo && <span className="ml-1 text-xs text-neutral-400 font-sans">(tú)</span>}</td>
                  <td className="px-4 py-2">
                    <button onClick={() => renombrar(u)} className="hover:underline text-left" title="Cambiar nombre">{u.full_name ?? '—'}</button>
                  </td>
                  <td className="px-4 py-2">
                    <select value={u.role} disabled={yo || !u.is_active} onChange={e => cambiarRol(u, e.target.value as Usuario['role'])}
                      className="border border-neutral-300 rounded px-2 py-1 text-xs bg-white disabled:bg-neutral-50"
                      title={yo ? 'No puedes cambiar tu propio rol' : undefined}>
                      <option value="admin">Admin</option>
                      <option value="user">Usuario</option>
                    </select>
                  </td>
                  <td className="px-4 py-2 text-neutral-500 text-xs">{fecha(u.last_login)}</td>
                  <td className="px-4 py-2 text-xs">
                    {u.is_active
                      ? <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-800">Activo</span>
                      : <span className="px-2 py-0.5 rounded-full bg-neutral-200 text-neutral-600">Inactivo</span>}
                  </td>
                  <td className="px-4 py-2 text-right space-x-2 whitespace-nowrap">
                    <button onClick={() => { setClaveDe(u); setError(null) }} className="btn-secondary text-xs">Cambiar contraseña</button>
                    {!yo && (
                      <button onClick={() => toggleActivo(u)} className="btn-secondary text-xs">
                        {u.is_active ? 'Desactivar' : 'Activar'}
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-neutral-500">
        <b>Admin</b>: todo el sistema. <b>Usuario</b>: dashboard simple, ventas, despachos, inventario (ajustes de stock) y recepciones.
        Desactivar o cambiar la contraseña cierra las sesiones abiertas de esa persona.
      </p>
    </div>
  )
}

function CampoClave({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-2">
      <input value={value} onChange={e => onChange(e.target.value)} autoComplete="new-password"
        className="border border-neutral-300 rounded px-2 py-1.5 text-sm font-mono flex-1" placeholder={`mínimo ${PASSWORD_MIN} caracteres`} />
      <button type="button" onClick={() => onChange(generarPassword())} className="btn-secondary text-xs">Generar</button>
    </div>
  )
}

function NuevoUsuario({ onCancelar, onCreado }: { onCancelar: () => void; onCreado: (msg: string) => void }) {
  const [f, setF] = useState({ username: '', full_name: '', role: 'user' as 'admin' | 'user', password: generarPassword() })
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const input = 'border border-neutral-300 rounded px-2 py-1.5 text-sm w-full'

  const crear = async () => {
    setGuardando(true); setError(null)
    const r = await fetch('/api/users', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f),
    })
    const d = await r.json().catch(() => ({}))
    setGuardando(false)
    if (!r.ok) { setError(d.error ?? 'Error'); return }
    onCreado(`Usuario "${f.username.toLowerCase().trim()}" creado. Pásale su contraseña: ${f.password}`)
  }

  return (
    <section className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4 space-y-3">
      <h2 className="text-sm font-semibold text-neutral-800">Nuevo usuario</h2>
      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">{error}</div>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="text-xs text-neutral-600">Nombre completo
          <input className={input} value={f.full_name} onChange={e => setF({ ...f, full_name: e.target.value })} />
        </label>
        <label className="text-xs text-neutral-600">Usuario (para entrar)
          <input className={`${input} font-mono`} value={f.username} autoComplete="off"
            onChange={e => setF({ ...f, username: e.target.value.toLowerCase().replace(/\s/g, '') })} placeholder="p.ej. maria" />
        </label>
        <label className="text-xs text-neutral-600">Rol
          <select className={input} value={f.role} onChange={e => setF({ ...f, role: e.target.value as 'admin' | 'user' })}>
            <option value="user">{ROL_TXT.user}</option>
            <option value="admin">{ROL_TXT.admin}</option>
          </select>
        </label>
        <label className="text-xs text-neutral-600">Contraseña inicial
          <CampoClave value={f.password} onChange={v => setF({ ...f, password: v })} />
        </label>
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onCancelar} className="btn-secondary text-sm">Cancelar</button>
        <button onClick={crear} disabled={guardando} className="btn-primary text-sm">{guardando ? 'Creando…' : 'Crear usuario'}</button>
      </div>
    </section>
  )
}

function CambiarClave({ u, esYo, onCancelar, onListo }: {
  u: Usuario; esYo: boolean; onCancelar: () => void; onListo: (msg: string, yo: boolean) => void
}) {
  const [password, setPassword] = useState(generarPassword())
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  const guardar = async () => {
    setGuardando(true); setError(null)
    const r = await fetch(`/api/users/${u.id}/password`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }),
    })
    const d = await r.json().catch(() => ({}))
    setGuardando(false)
    if (!r.ok) { setError(d.error ?? 'Error'); return }
    onListo(`Contraseña de ${u.username} cambiada: ${password} — sus sesiones abiertas se cerraron.`, esYo)
  }

  return (
    <section className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4 space-y-3">
      <h2 className="text-sm font-semibold text-neutral-800">Nueva contraseña para {u.full_name ?? u.username}</h2>
      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">{error}</div>}
      <CampoClave value={password} onChange={setPassword} />
      {esYo && <p className="text-xs text-amber-700">Es tu propia contraseña: al guardarla se cierra tu sesión y entras de nuevo con la nueva.</p>}
      <div className="flex justify-end gap-2">
        <button onClick={onCancelar} className="btn-secondary text-sm">Cancelar</button>
        <button onClick={guardar} disabled={guardando} className="btn-primary text-sm">{guardando ? 'Guardando…' : 'Guardar'}</button>
      </div>
    </section>
  )
}
