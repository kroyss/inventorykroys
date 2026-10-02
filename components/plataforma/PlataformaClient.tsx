'use client'
import { useCallback, useEffect, useState } from 'react'
import { PageHeader } from '@/components/ui'
import CuentasPanel from './CuentasPanel'
import FundadoresPanel from './FundadoresPanel'
import InternoPanel from './InternoPanel'

interface Empresa {
  id: number
  nombre: string
  country: 'VE' | 'CO'
  modulos: string[]
  is_active: boolean
  created_at: string
  organizacion_id: number
  organizacion: string
  usuarios: number
  admins: string | null
}

const input = 'mt-1 w-full border border-neutral-300 rounded px-2 py-1.5 text-sm bg-white'

// Clave inicial legible (sin 0/O/1/l): el cliente la cambia al entrar.
function claveInicial() {
  const abc = 'abcdefghjkmnpqrstuvwxyz23456789'
  const r = crypto.getRandomValues(new Uint32Array(10))
  return Array.from(r, n => abc[n % abc.length]).join('')
}

export default function PlataformaClient({ empresaActual }: { empresaActual: number }) {
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [modulos, setModulos]   = useState<Record<string, string>>({})
  const [nueva, setNueva]       = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [aviso, setAviso]       = useState<string | null>(null)
  const [vista, setVista]       = useState<'empresas' | 'cuentas' | 'fundadores' | 'interno'>('empresas')

  const cargar = useCallback(async () => {
    const r = await fetch('/api/plataforma/empresas')
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setError(d.error ?? 'No se pudo cargar'); return }
    setEmpresas(d.empresas); setModulos(d.modulos)
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const actualizar = async (e: Empresa, cambios: Partial<Pick<Empresa, 'modulos' | 'is_active'>>) => {
    setError(null); setAviso(null)
    const r = await fetch(`/api/plataforma/empresas/${e.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cambios),
    })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setError(d.error ?? 'Error'); return }
    setAviso(`${e.nombre}: cambios guardados. Sus usuarios los ven en su próximo clic.`)
    cargar()
  }

  const alternarModulo = (e: Empresa, m: string) =>
    actualizar(e, { modulos: e.modulos.includes(m) ? e.modulos.filter(x => x !== m) : [...e.modulos, m] })

  return (
    <div className="space-y-4">
      <PageHeader
        title="Plataforma"
        subtitle="Empresas, módulos y cuentas de El Comerciante Digital. Solo lo ves tú."
        actions={vista === 'empresas'
          ? <button onClick={() => { setNueva(true); setError(null) }} className="btn-primary text-sm">+ Nueva empresa</button>
          : undefined}
      />

      <div className="flex gap-1 border-b border-neutral-200">
        {(['empresas', 'cuentas', 'fundadores', 'interno'] as const).map(v => (
          <button key={v} onClick={() => setVista(v)}
            className={`px-3 py-1.5 text-sm -mb-px border-b-2 ${vista === v ? 'border-neutral-900 font-semibold' : 'border-transparent text-neutral-500'}`}>
            {v === 'empresas' ? 'Empresas' : v === 'cuentas' ? 'Cuentas' : v === 'fundadores' ? 'Fundadores' : 'Interno'}
          </button>
        ))}
      </div>

      {vista === 'cuentas' ? <CuentasPanel /> : vista === 'fundadores' ? <FundadoresPanel /> : vista === 'interno' ? <InternoPanel /> : <>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded text-sm">{error}</div>}
      {aviso && <div className="bg-neutral-50 border border-neutral-200 text-neutral-700 px-4 py-2 rounded text-sm">{aviso}</div>}

      {nueva && (
        <NuevaEmpresa modulos={modulos}
          onCancelar={() => setNueva(false)}
          onCreada={msg => { setNueva(false); setAviso(msg); cargar() }} />
      )}

      <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-xs text-neutral-500">
            <tr>
              <th className="px-4 py-2 text-left">Empresa</th>
              <th className="px-4 py-2 text-left">País</th>
              <th className="px-4 py-2 text-left">Admins</th>
              <th className="px-4 py-2 text-right">Usuarios</th>
              <th className="px-4 py-2 text-left">Módulos</th>
              <th className="px-4 py-2 text-left">Estado</th>
            </tr>
          </thead>
          <tbody>
            {empresas.map(e => (
              <tr key={e.id} className={`border-t border-neutral-100 align-top ${!e.is_active ? 'opacity-50' : ''}`}>
                <td className="px-4 py-2">
                  <div className="font-medium">{e.nombre}</div>
                  {e.organizacion !== e.nombre && <div className="text-xs text-neutral-400">{e.organizacion}</div>}
                </td>
                <td className="px-4 py-2">{e.country}</td>
                <td className="px-4 py-2 font-mono text-xs">{e.admins ?? '—'}</td>
                <td className="px-4 py-2 text-right">{e.usuarios}</td>
                <td className="px-4 py-2">
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(modulos).map(([m, desc]) => (
                      <button key={m} onClick={() => alternarModulo(e, m)} title={desc}
                        className={`px-2 py-0.5 rounded-full text-xs border ${
                          e.modulos.includes(m)
                            ? 'bg-green-100 border-green-200 text-green-800'
                            : 'bg-white border-neutral-200 text-neutral-400'
                        }`}>
                        {e.modulos.includes(m) ? '✓ ' : ''}{m}
                      </button>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-2">
                  <button disabled={e.id === empresaActual}
                    onClick={() => actualizar(e, { is_active: !e.is_active })}
                    title={e.id === empresaActual ? 'Es la empresa en la que estás' : undefined}
                    className={`px-2 py-0.5 rounded-full text-xs ${e.is_active ? 'bg-green-100 text-green-800' : 'bg-neutral-200 text-neutral-600'} disabled:cursor-not-allowed`}>
                    {e.is_active ? 'Activa' : 'Desactivada'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-neutral-500">
        Inicio, Ventas, Inventario, Compras, Productos, Reportes, Ajustes y Usuarios los tienen todas las empresas.
        Tocar un módulo lo prende o lo apaga. Desactivar una empresa saca a sus usuarios; sus datos se conservan.
      </p>
      </>}
    </div>
  )
}

function NuevaEmpresa({ modulos, onCancelar, onCreada }: {
  modulos: Record<string, string>; onCancelar: () => void; onCreada: (msg: string) => void
}) {
  const [f, setF] = useState({
    nombre: '', country: 'VE' as 'VE' | 'CO', modulos: ['despachos', 'reportador'],
    username: '', full_name: '', password: claveInicial(),
  })
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const crear = async () => {
    setGuardando(true); setError(null)
    const r = await fetch('/api/plataforma/empresas', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre: f.nombre, country: f.country, modulos: f.modulos,
        admin: { username: f.username, full_name: f.full_name, password: f.password },
      }),
    })
    const d = await r.json().catch(() => ({}))
    setGuardando(false)
    if (!r.ok) { setError(d.error ?? 'Error'); return }
    onCreada(`Empresa "${f.nombre}" creada. Su administrador entra con el usuario "${f.username}" y la contraseña ${f.password}.`)
  }

  return (
    <section className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4 space-y-3">
      <h2 className="text-sm font-semibold text-neutral-800">Nueva empresa</h2>
      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">{error}</div>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="text-xs text-neutral-600">Nombre de la empresa
          <input className={input} value={f.nombre} onChange={e => setF({ ...f, nombre: e.target.value })} placeholder="p.ej. Tienda Pérez" />
        </label>
        <label className="text-xs text-neutral-600">País
          <select className={input} value={f.country} onChange={e => setF({ ...f, country: e.target.value as 'VE' | 'CO' })}>
            <option value="VE">Venezuela</option>
            <option value="CO">Colombia</option>
          </select>
        </label>
        <label className="text-xs text-neutral-600">Administrador: nombre completo
          <input className={input} value={f.full_name} onChange={e => setF({ ...f, full_name: e.target.value })} />
        </label>
        <label className="text-xs text-neutral-600">Administrador: usuario (para entrar)
          <input className={`${input} font-mono`} value={f.username} autoComplete="off"
            onChange={e => setF({ ...f, username: e.target.value.toLowerCase().replace(/\s/g, '') })} placeholder="p.ej. perez" />
        </label>
        <label className="text-xs text-neutral-600">Contraseña inicial (se la pasas; la puede cambiar)
          <div className="flex gap-2">
            <input className={`${input} font-mono`} value={f.password} autoComplete="new-password"
              onChange={e => setF({ ...f, password: e.target.value })} />
            <button type="button" onClick={() => setF({ ...f, password: claveInicial() })} className="btn-secondary text-xs mt-1">Otra</button>
          </div>
        </label>
        <div className="text-xs text-neutral-600">Módulos
          <div className="mt-1 flex flex-wrap gap-1.5">
            {Object.entries(modulos).map(([m, desc]) => (
              <label key={m} className="flex items-center gap-1 border border-neutral-200 rounded px-2 py-1" title={desc}>
                <input type="checkbox" checked={f.modulos.includes(m)}
                  onChange={() => setF({ ...f, modulos: f.modulos.includes(m) ? f.modulos.filter(x => x !== m) : [...f.modulos, m] })} />
                {m}
              </label>
            ))}
          </div>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onCancelar} className="btn-secondary text-sm">Cancelar</button>
        <button onClick={crear} disabled={guardando} className="btn-primary text-sm">{guardando ? 'Creando…' : 'Crear empresa'}</button>
      </div>
    </section>
  )
}
