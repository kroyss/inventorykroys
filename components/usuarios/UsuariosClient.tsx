'use client'
import { useCallback, useEffect, useState } from 'react'
import { signOut } from 'next-auth/react'
import { PageHeader } from '@/components/ui'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import type { Country } from '@/lib/types'

interface Usuario {
  id: number; username: string; full_name: string | null; role: 'admin' | 'user'
  permisos: string[] | null     // null = los de su rol (lib/permisos.ts)
  is_active: boolean; created_at: string | null; last_login: string | null
}

interface PermisoDisponible { clave: string; tipo: 'seccion' | 'accion'; nombre: string; detalle?: string; usuario: boolean }

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

const ROL_TXT = { admin: 'Admin (todo)', user: 'Usuario (lo que marques en Permisos)' }

export default function UsuariosClient({ country }: { country: Country }) {
  const confirm = useConfirm()
  const [users, setUsers] = useState<Usuario[]>([])
  const [me, setMe]       = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [nuevo, setNuevo] = useState(false)
  const [claveDe, setClaveDe] = useState<Usuario | null>(null)
  const [permisosDe, setPermisosDe] = useState<Usuario | null>(null)
  const [disponibles, setDisponibles] = useState<PermisoDisponible[]>([])
  const [predeterminado, setPredeterminado] = useState<string[]>([])

  const cargar = useCallback(() => fetch('/api/users').then(async r => {
    const d = await r.json()
    if (!r.ok) { setError(d.error ?? 'Error'); return }
    setUsers(d.users); setMe(d.me); setDisponibles(d.disponibles ?? []); setPredeterminado(d.predeterminado ?? [])
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
        subtitle={`Quién puede entrar a esta empresa (${country}). Cada empresa tiene sus propios usuarios.`}
        actions={<button onClick={() => { setNuevo(true); setError(null) }} className="btn-primary text-sm">+ Nuevo usuario</button>}
      />

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded text-sm">{error}</div>}
      {aviso && <div className="bg-neutral-50 border border-neutral-200 text-neutral-700 px-4 py-2 rounded text-sm">{aviso}</div>}

      {nuevo && <NuevoUsuario onCancelar={() => setNuevo(false)} onCreado={(msg) => { setNuevo(false); setAviso(msg); cargar() }} />}
      {permisosDe && (
        <PermisosUsuario key={permisosDe.id} u={permisosDe} disponibles={disponibles} predeterminado={predeterminado}
          onCancelar={() => setPermisosDe(null)}
          onGuardado={msg => { setPermisosDe(null); setAviso(msg); cargar() }} />
      )}
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
              <th className="px-4 py-2 text-left">Permisos</th>
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
                  <td className="px-4 py-2">
                    <ResumenPermisos u={u} disponibles={disponibles} predeterminado={predeterminado}
                      onAbrir={() => { setPermisosDe(u); setClaveDe(null); setError(null) }} />
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
        <b>Admin</b>: todo el sistema, incluidos Usuarios y Ajustes. <b>Usuario</b>: lo que le marques en <b>Permisos</b>; si no lo
        tocas, lo predeterminado (inicio simple, ventas, inventario, recepciones y automatizaciones, sin costos ni configuración).
        Los permisos se aplican al instante. Desactivar o cambiar la contraseña cierra las sesiones abiertas de esa persona.
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

// ── Permisos (lib/permisos.ts) ──────────────────────────────────────────────

/** Celda de la tabla: "Todo" para el admin; para el usuario, si son los de su rol o personalizados. */
function ResumenPermisos({ u, disponibles, predeterminado, onAbrir }: {
  u: Usuario; disponibles: PermisoDisponible[]; predeterminado: string[]; onAbrir: () => void
}) {
  if (u.role === 'admin') return <span className="text-xs text-neutral-400">Todo</span>
  const tiene = new Set(u.permisos ?? predeterminado)
  const n = disponibles.filter(d => tiene.has(d.clave)).length
  return (
    <button type="button" onClick={onAbrir} disabled={!u.is_active}
      className="group inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-2.5 py-0.5 text-xs text-neutral-700 transition-colors hover:border-neutral-400 disabled:cursor-default disabled:hover:border-neutral-200"
      title="Ver y cambiar lo que puede ver y hacer">
      <span className={`h-1.5 w-1.5 rounded-full ${u.permisos ? 'bg-amber-500' : 'bg-neutral-300'}`} />
      {u.permisos ? 'Personalizados' : 'Predeterminados'}
      <span className="num text-neutral-400">{n}/{disponibles.length}</span>
      <svg className="h-3 w-3 text-neutral-400 group-hover:text-neutral-600" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
    </button>
  )
}

function Llave({ on, onChange, etiqueta }: { on: boolean; onChange: (v: boolean) => void; etiqueta: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={etiqueta} onClick={() => onChange(!on)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1 ${
        on ? 'bg-emerald-500' : 'bg-neutral-300'}`}>
      <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
    </button>
  )
}

function FilaPermiso({ d, on, cambiado, onChange }: {
  d: PermisoDisponible; on: boolean; cambiado: boolean; onChange: (v: boolean) => void
}) {
  return (
    <li className="flex items-start justify-between gap-3 px-3 py-2.5">
      <div className="min-w-0">
        <p className={`text-sm ${on ? 'text-neutral-900' : 'text-neutral-500'}`}>
          {d.nombre}
          {cambiado && <span className="ml-1.5 rounded bg-amber-50 px-1.5 py-px align-middle text-[10px] font-medium text-amber-700">cambiado</span>}
        </p>
        {d.detalle && <p className="mt-0.5 text-xs leading-snug text-neutral-400">{d.detalle}</p>}
      </div>
      <div className="pt-0.5"><Llave on={on} onChange={onChange} etiqueta={d.nombre} /></div>
    </li>
  )
}

function PermisosUsuario({ u, disponibles, predeterminado, onCancelar, onGuardado }: {
  u: Usuario; disponibles: PermisoDisponible[]; predeterminado: string[]
  onCancelar: () => void; onGuardado: (msg: string) => void
}) {
  // Se parte de lo que tiene hoy y se manda la lista COMPLETA: los permisos de módulos que esta
  // empresa no tiene (no se muestran) se conservan tal cual.
  const [sel, setSel] = useState(() => new Set(u.permisos ?? predeterminado))
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const nombre = u.full_name ?? u.username
  const defecto = new Set(predeterminado)
  const cambiado = (clave: string) => sel.has(clave) !== defecto.has(clave)
  const personalizado = disponibles.some(d => cambiado(d.clave))
  const poner = (clave: string, on: boolean) => setSel(prev => {
    const s = new Set(prev)
    if (on) s.add(clave); else s.delete(clave)
    return s
  })

  const guardar = async () => {
    setGuardando(true); setError(null)
    const r = await fetch(`/api/users/${u.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      // Igual a lo predeterminado = se guarda NULL: si mañana cambia lo del rol, lo sigue.
      body: JSON.stringify({ permisos: personalizado ? [...sel] : null }),
    })
    const d = await r.json().catch(() => ({}))
    setGuardando(false)
    if (!r.ok) { setError(d.error ?? 'No se pudo guardar'); return }
    onGuardado(`Permisos de ${nombre} guardados. Si tiene el sistema abierto, los ve al cambiar de pantalla.`)
  }

  const grupo = (tipo: PermisoDisponible['tipo'], titulo: string, nota: string) => {
    const lista = disponibles.filter(d => d.tipo === tipo)
    if (!lista.length) return null
    return (
      <div className="min-w-0">
        <div className="mb-1.5 flex items-baseline justify-between gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-600">{titulo}</h3>
          <span className="text-[11px] text-neutral-400">{nota}</span>
        </div>
        <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200">
          {lista.map(d => (
            <FilaPermiso key={d.clave} d={d} on={sel.has(d.clave)} cambiado={cambiado(d.clave)} onChange={v => poner(d.clave, v)} />
          ))}
        </ul>
      </div>
    )
  }

  return (
    <section className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-neutral-800">Permisos de {nombre}</h2>
          <p className="mt-0.5 text-xs text-neutral-500">Lo que ve y puede hacer en esta empresa. Usuarios y Ajustes son siempre solo de un admin.</p>
        </div>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
          personalizado ? 'bg-amber-50 text-amber-800' : 'bg-neutral-100 text-neutral-600'}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${personalizado ? 'bg-amber-500' : 'bg-neutral-400'}`} />
          {personalizado ? 'Personalizados' : 'Predeterminados del rol'}
        </span>
      </div>
      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">{error}</div>}
      <div className="grid gap-4 md:grid-cols-2">
        {grupo('seccion', 'Secciones', 'Qué ve en el menú')}
        {grupo('accion', 'Acciones', 'Qué puede hacer dentro')}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-neutral-100 pt-3">
        <button type="button" onClick={() => setSel(new Set(predeterminado))} disabled={!personalizado}
          className="text-xs text-neutral-500 underline-offset-2 hover:text-neutral-800 hover:underline disabled:text-neutral-300 disabled:no-underline">
          Volver a lo predeterminado
        </button>
        <div className="flex gap-2">
          <button onClick={onCancelar} className="btn-secondary text-sm">Cancelar</button>
          <button onClick={guardar} disabled={guardando} className="btn-primary text-sm">{guardando ? 'Guardando…' : 'Guardar permisos'}</button>
        </div>
      </div>
    </section>
  )
}
