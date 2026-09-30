'use client'
import { useCallback, useEffect, useState } from 'react'

interface Cuenta {
  id: number
  username: string
  email: string | null
  full_name: string | null
  is_active: boolean
  productos: string[]
  last_login: string | null
  empresas: { nombre: string; role: string }[]
}

const input = 'mt-1 w-full border border-neutral-300 rounded px-2 py-1.5 text-sm bg-white'

function claveInicial() {
  const abc = 'abcdefghjkmnpqrstuvwxyz23456789'
  const r = crypto.getRandomValues(new Uint32Array(10))
  return Array.from(r, n => abc[n % abc.length]).join('')
}

/** Plataforma → Cuentas: una cuenta por persona para todos los productos (entra con su
 *  usuario; el correo es para recuperar la clave). Aquí se marca a qué productos entra. */
export default function CuentasPanel() {
  const [cuentas, setCuentas]     = useState<Cuenta[]>([])
  const [productos, setProductos] = useState<Record<string, string>>({})
  const [nueva, setNueva]         = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [aviso, setAviso]         = useState<string | null>(null)
  const [buscar, setBuscar]       = useState('')

  const cargar = useCallback(async () => {
    const r = await fetch('/api/plataforma/cuentas')
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setError(d.error ?? 'No se pudo cargar'); return }
    setCuentas(d.cuentas); setProductos(d.productos)
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const actualizar = async (c: Cuenta, cambios: { email?: string; productos?: string[] }) => {
    setError(null); setAviso(null)
    const r = await fetch(`/api/plataforma/cuentas/${c.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cambios),
    })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setError(d.error ?? 'Error'); return }
    setAviso(`${c.username}: guardado`)
    cargar()
  }

  const cambiarCorreo = (c: Cuenta) => {
    const email = window.prompt(`Correo de ${c.username} (vacío = sin correo)`, c.email ?? '')
    if (email === null) return
    actualizar(c, { email: email.trim() })
  }

  const alternar = (c: Cuenta, p: string) =>
    actualizar(c, { productos: c.productos.includes(p) ? c.productos.filter(x => x !== p) : [...c.productos, p] })

  const q = buscar.trim().toLowerCase()
  const visibles = q ? cuentas.filter(c => `${c.username} ${c.email ?? ''} ${c.full_name ?? ''}`.toLowerCase().includes(q)) : cuentas

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar usuario, nombre o correo…"
          className="border border-neutral-300 rounded px-2 py-1.5 text-sm w-72" />
        <button onClick={() => { setNueva(true); setError(null) }} className="btn-primary text-sm ml-auto">+ Nueva cuenta</button>
      </div>
      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded text-sm">{error}</div>}
      {aviso && <div className="bg-neutral-50 border border-neutral-200 text-neutral-700 px-4 py-2 rounded text-sm">{aviso}</div>}
      {nueva && <NuevaCuenta productos={productos} onCancelar={() => setNueva(false)}
        onCreada={msg => { setNueva(false); setAviso(msg); cargar() }} />}

      <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-xs text-neutral-500">
            <tr>
              <th className="px-4 py-2 text-left">Usuario</th>
              <th className="px-4 py-2 text-left">Nombre</th>
              <th className="px-4 py-2 text-left">Correo (recuperar clave)</th>
              <th className="px-4 py-2 text-left">Productos</th>
              <th className="px-4 py-2 text-left">Empresas de inventario</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map(c => (
              <tr key={c.id} className={`border-t border-neutral-100 align-top ${!c.is_active ? 'opacity-50' : ''}`}>
                <td className="px-4 py-2 font-mono">{c.username}</td>
                <td className="px-4 py-2">{c.full_name ?? '—'}</td>
                <td className="px-4 py-2">
                  <button onClick={() => cambiarCorreo(c)} className="hover:underline text-left" title="Cambiar correo">
                    {c.email ?? <span className="text-neutral-400">agregar…</span>}
                  </button>
                </td>
                <td className="px-4 py-2">
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(productos).map(([p, desc]) => (
                      <button key={p} onClick={() => alternar(c, p)} title={desc}
                        className={`px-2 py-0.5 rounded-full text-xs border ${
                          c.productos.includes(p) ? 'bg-green-100 border-green-200 text-green-800' : 'bg-white border-neutral-200 text-neutral-400'
                        }`}>
                        {c.productos.includes(p) ? '✓ ' : ''}{p}
                      </button>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-2 text-xs text-neutral-600">
                  {c.empresas.length ? c.empresas.map(e => `${e.nombre} (${e.role})`).join(', ') : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-neutral-500">
        Cada persona entra con su <b>usuario</b> a todos los productos que tenga marcados. El correo solo sirve para recuperar la clave.
        El acceso a empresas de inventario (y su rol) se maneja en Usuarios de cada empresa.
      </p>
    </div>
  )
}

function NuevaCuenta({ productos, onCancelar, onCreada }: {
  productos: Record<string, string>; onCancelar: () => void; onCreada: (msg: string) => void
}) {
  const [f, setF] = useState({ username: '', email: '', full_name: '', password: claveInicial(), productos: ['radar'] })
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const crear = async () => {
    setGuardando(true); setError(null)
    const r = await fetch('/api/plataforma/cuentas', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f),
    })
    const d = await r.json().catch(() => ({}))
    setGuardando(false)
    if (!r.ok) { setError(d.error ?? 'Error'); return }
    onCreada(`Cuenta "${f.username}" creada. Entra con ese usuario y la contraseña ${f.password}.`)
  }

  return (
    <section className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4 space-y-3">
      <h2 className="text-sm font-semibold text-neutral-800">Nueva cuenta</h2>
      <p className="text-xs text-neutral-500">Para alguien que entra solo al Radar (u otro producto sin empresa de inventario). Para inventario, crea la empresa o el usuario desde la empresa.</p>
      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">{error}</div>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="text-xs text-neutral-600">Nombre completo
          <input className={input} value={f.full_name} onChange={e => setF({ ...f, full_name: e.target.value })} />
        </label>
        <label className="text-xs text-neutral-600">Usuario (para entrar)
          <input className={`${input} font-mono`} value={f.username} autoComplete="off"
            onChange={e => setF({ ...f, username: e.target.value.toLowerCase().replace(/\s/g, '') })} />
        </label>
        <label className="text-xs text-neutral-600">Correo (para recuperar la clave)
          <input className={input} value={f.email} type="email" onChange={e => setF({ ...f, email: e.target.value })} />
        </label>
        <label className="text-xs text-neutral-600">Contraseña inicial
          <div className="flex gap-2">
            <input className={`${input} font-mono`} value={f.password} autoComplete="new-password" onChange={e => setF({ ...f, password: e.target.value })} />
            <button type="button" onClick={() => setF({ ...f, password: claveInicial() })} className="btn-secondary text-xs mt-1">Otra</button>
          </div>
        </label>
        <div className="text-xs text-neutral-600">Productos
          <div className="mt-1 flex flex-wrap gap-1.5">
            {Object.entries(productos).map(([p, desc]) => (
              <label key={p} className="flex items-center gap-1 border border-neutral-200 rounded px-2 py-1" title={desc}>
                <input type="checkbox" checked={f.productos.includes(p)}
                  onChange={() => setF({ ...f, productos: f.productos.includes(p) ? f.productos.filter(x => x !== p) : [...f.productos, p] })} />
                {p}
              </label>
            ))}
          </div>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onCancelar} className="btn-secondary text-sm">Cancelar</button>
        <button onClick={crear} disabled={guardando} className="btn-primary text-sm">{guardando ? 'Creando…' : 'Crear cuenta'}</button>
      </div>
    </section>
  )
}
