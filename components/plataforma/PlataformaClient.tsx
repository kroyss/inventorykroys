'use client'
import { useCallback, useEffect, useState } from 'react'
import { PageHeader } from '@/components/ui'
import CuentasPanel from './CuentasPanel'
import FundadoresPanel from './FundadoresPanel'
import InternoPanel from './InternoPanel'
import AprendizajePanel from './AprendizajePanel'
import { DIAS_PRUEBA, ETIQUETA_ESTADO, estadoEfectivo, type EstadoCuenta } from '@/lib/cuenta'

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
  estado: EstadoCuenta
  prueba_hasta: string | null
  prueba_dias: number | null
  fundador: boolean
  ia_limite_mes: number | null
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
  const [vista, setVista]       = useState<'empresas' | 'cuentas' | 'fundadores' | 'aprendizaje' | 'interno'>('empresas')
  const [hoy, setHoy]           = useState('')
  const [borrar, setBorrar]     = useState<Empresa | null>(null)

  const cargar = useCallback(async () => {
    const r = await fetch('/api/plataforma/empresas')
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setError(d.error ?? 'No se pudo cargar'); return }
    setEmpresas(d.empresas); setModulos(d.modulos); setHoy(d.hoy)
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const actualizar = async (e: Empresa, cambios: Partial<Pick<Empresa, 'nombre' | 'modulos' | 'is_active' | 'ia_limite_mes'>>) => {
    setError(null); setAviso(null)
    const r = await fetch(`/api/plataforma/empresas/${e.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cambios),
    })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setError(d.error ?? 'Error'); return }
    setAviso(`${e.nombre}: cambios guardados. Sus usuarios los ven en su próximo clic.`)
    cargar()
  }

  const renombrar = (e: Empresa) => {
    const nombre = window.prompt(`Nuevo nombre para "${e.nombre}"`, e.nombre)?.trim()
    if (nombre && nombre !== e.nombre) actualizar(e, { nombre })
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
        {(['empresas', 'cuentas', 'fundadores', 'aprendizaje', 'interno'] as const).map(v => (
          <button key={v} onClick={() => setVista(v)}
            className={`px-3 py-1.5 text-sm -mb-px border-b-2 ${vista === v ? 'border-neutral-900 font-semibold' : 'border-transparent text-neutral-500'}`}>
            {v === 'empresas' ? 'Empresas' : v === 'cuentas' ? 'Cuentas' : v === 'fundadores' ? 'Fundadores' : v === 'aprendizaje' ? 'Aprendizaje' : 'Interno'}
          </button>
        ))}
      </div>

      {vista === 'cuentas' ? <CuentasPanel /> : vista === 'fundadores' ? <FundadoresPanel /> : vista === 'interno' ? <InternoPanel /> : vista === 'aprendizaje' ? <AprendizajePanel /> : <>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded text-sm">{error}</div>}
      {aviso && <div className="bg-neutral-50 border border-neutral-200 text-neutral-700 px-4 py-2 rounded text-sm">{aviso}</div>}

      {borrar && (
        <EliminarEmpresa e={borrar} onCancelar={() => setBorrar(null)}
          onEliminada={msg => { setBorrar(null); setAviso(msg); cargar() }} />
      )}

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
              <th className="px-4 py-2 text-left">Cuenta</th>
              <th className="px-4 py-2 text-left">País</th>
              <th className="px-4 py-2 text-left">Admins</th>
              <th className="px-4 py-2 text-right">Usuarios</th>
              <th className="px-4 py-2 text-left">Módulos</th>
              <th className="px-4 py-2 text-right" title="Créditos de IA por mes (1 por borrador; buscar en internet, hasta 4). Vacío = sin límite">IA/mes</th>
              <th className="px-4 py-2 text-left">Estado</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {empresas.map(e => (
              <tr key={e.id} className={`border-t border-neutral-100 align-top ${!e.is_active ? 'opacity-50' : ''}`}>
                <td className="px-4 py-2">
                  <button onClick={() => renombrar(e)} title="Cambiar el nombre" className="font-medium text-left hover:underline">{e.nombre} <span className="text-neutral-400 text-xs">✏️</span></button>
                  {e.organizacion !== e.nombre && <div className="text-xs text-neutral-400">{e.organizacion}</div>}
                </td>
                <td className="px-4 py-2"><Cuenta e={e} hoy={hoy} onGuardada={msg => { setAviso(msg); cargar() }} onError={setError} /></td>
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
                <td className="px-4 py-2 text-right">
                  <LimiteIA key={`${e.id}-${e.ia_limite_mes}`} valor={e.ia_limite_mes} onGuardar={v => actualizar(e, { ia_limite_mes: v })} />
                </td>
                <td className="px-4 py-2">
                  <button disabled={e.id === empresaActual}
                    onClick={() => actualizar(e, { is_active: !e.is_active })}
                    title={e.id === empresaActual ? 'Es la empresa en la que estás' : undefined}
                    className={`px-2 py-0.5 rounded-full text-xs ${e.is_active ? 'bg-green-100 text-green-800' : 'bg-neutral-200 text-neutral-600'} disabled:cursor-not-allowed`}>
                    {e.is_active ? 'Activa' : 'Desactivada'}
                  </button>
                </td>
                <td className="px-4 py-2 text-right">
                  {e.estado !== 'propietario' && (
                    <button onClick={() => { setError(null); setAviso(null); setBorrar(e) }} title="Eliminar la empresa con todos sus datos"
                      className="text-xs text-red-600 hover:underline">Eliminar</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-neutral-500">
        Inicio, Ventas, Inventario, Compras, Productos, Reportes, Ajustes y Usuarios los tienen todas las empresas.
        Tocar el nombre lo cambia; tocar un módulo lo prende o lo apaga. Desactivar una empresa saca a sus usuarios; sus datos se conservan.
        Eliminar la borra con TODOS sus datos (primero hay que desactivarla).
        Cuenta: una prueba vence sola al pasar su fecha (sus usuarios ya no entran, los datos quedan); tócala para cambiarla.
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
    alta: 'fundador' as 'fundador' | 'prueba' | 'activo',
    username: '', full_name: '', password: claveInicial(),
  })
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const crear = async () => {
    setGuardando(true); setError(null)
    const r = await fetch('/api/plataforma/empresas', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre: f.nombre, country: f.country, modulos: f.modulos, alta: f.alta,
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
        <label className="text-xs text-neutral-600">Cuenta
          <select className={input} value={f.alta} onChange={e => setF({ ...f, alta: e.target.value as typeof f.alta })}>
            <option value="fundador">⭐ Fundador: {DIAS_PRUEBA.fundador} días gratis desde que conecte ML</option>
            <option value="prueba">Prueba: {DIAS_PRUEBA.normal} días gratis desde que conecte ML</option>
            <option value="activo">Activo (ya paga)</option>
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

const COLOR_ESTADO: Record<EstadoCuenta, string> = {
  propietario: 'bg-neutral-900 text-white',
  prueba:      'bg-sky-100 text-sky-800',
  activo:      'bg-green-100 text-green-800',
  vencido:     'bg-red-100 text-red-700',
}
const ddmm = (iso: string) => iso.split('-').reverse().slice(0, 2).join('/')

/** Estado de la cuenta de la organización (lib/cuenta.ts): pastilla + editor al tocarla. */
/** Límite de borradores de IA por mes: se guarda al salir del campo (vacío = sin límite). Se
 *  rearma (key) cuando cambia el valor guardado. */
function LimiteIA({ valor, onGuardar }: { valor: number | null; onGuardar: (v: number | null) => void }) {
  const [v, setV] = useState(valor == null ? '' : String(valor))
  const guardar = () => {
    const n = v.trim() === '' ? null : Math.max(0, Math.round(Number(v)))
    if (n !== null && !Number.isFinite(n)) { setV(valor == null ? '' : String(valor)); return }
    if (n !== valor) onGuardar(n)
  }
  return (
    <input value={v} onChange={ev => setV(ev.target.value.replace(/[^0-9]/g, ''))} onBlur={guardar}
      onKeyDown={ev => { if (ev.key === 'Enter') (ev.target as HTMLInputElement).blur() }}
      inputMode="numeric" placeholder="sin límite" title="Créditos de IA por mes (vacío = sin límite)"
      className="w-20 border border-neutral-200 rounded px-1.5 py-0.5 text-xs text-right num" />
  )
}

function Cuenta({ e, hoy, onGuardada, onError }: {
  e: Empresa; hoy: string; onGuardada: (msg: string) => void; onError: (msg: string) => void
}) {
  const [editando, setEditando] = useState(false)
  const [f, setF] = useState({ estado: e.estado, prueba_hasta: e.prueba_hasta ?? '', fundador: e.fundador })
  const ef = estadoEfectivo(e.estado, e.prueba_hasta, hoy)
  const esperando = ef === 'prueba' && e.prueba_dias != null      // aún no conecta ML (migración 067)
  const dias = e.prueba_hasta && ef === 'prueba' && !esperando
    ? Math.round((Date.parse(`${e.prueba_hasta}T12:00:00Z`) - Date.parse(`${hoy}T12:00:00Z`)) / 86_400_000) : null

  const pastilla = (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span className={`px-2 py-0.5 rounded-full text-xs whitespace-nowrap ${COLOR_ESTADO[ef]}`}>
        {ETIQUETA_ESTADO[ef]}
        {esperando ? ` · ${e.prueba_dias} días al conectar ML` : ef === 'prueba' && e.prueba_hasta ? ` · hasta ${ddmm(e.prueba_hasta)}` : ''}
        {ef === 'vencido' && e.estado === 'prueba' && e.prueba_hasta ? ` · el ${ddmm(e.prueba_hasta)}` : ''}
      </span>
      {esperando && e.prueba_hasta && <span className="text-[11px] text-neutral-500 whitespace-nowrap"
        title={`Si no conecta su cuenta de MercadoLibre, los días corren igual: vence a más tardar el ${ddmm(e.prueba_hasta)}`}>
        tope {ddmm(e.prueba_hasta)}</span>}
      {e.fundador && <span className="text-xs text-amber-700 whitespace-nowrap" title="Programa Fundadores: precio especial">⭐ Fundador</span>}
      {dias != null && dias <= 5 && <span className="text-[11px] text-amber-700 whitespace-nowrap">quedan {dias} día{dias === 1 ? '' : 's'}</span>}
    </span>
  )
  if (e.estado === 'propietario') return pastilla

  const guardar = async () => {
    const r = await fetch(`/api/plataforma/organizaciones/${e.organizacion_id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado: f.estado, fundador: f.fundador, prueba_hasta: f.estado === 'prueba' ? (f.prueba_hasta || null) : undefined }),
    })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { onError(d.error ?? 'No se pudo guardar'); return }
    setEditando(false)
    onGuardada(`${e.organizacion}: cuenta actualizada. Sus usuarios lo notan en su próximo clic.`)
  }
  const sumar = (n: number) => {
    const d = new Date(`${hoy}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n)
    setF({ ...f, estado: 'prueba', prueba_hasta: d.toISOString().slice(0, 10) })
  }

  if (!editando) {
    return (
      <button onClick={() => { setF({ estado: e.estado, prueba_hasta: e.prueba_hasta ?? '', fundador: e.fundador }); setEditando(true) }}
        title="Cambiar la cuenta" className="text-left hover:opacity-80">{pastilla}</button>
    )
  }
  return (
    <div className="space-y-1.5 min-w-[13rem] text-xs">
      <select className={input} value={f.estado} onChange={ev => setF({ ...f, estado: ev.target.value as EstadoCuenta })}>
        <option value="prueba">En prueba</option>
        <option value="activo">Activo (paga)</option>
        <option value="vencido">Vencido (no entra)</option>
      </select>
      {f.estado === 'prueba' && (
        <div className="space-y-1">
          <input type="date" className={input} value={f.prueba_hasta} onChange={ev => setF({ ...f, prueba_hasta: ev.target.value })} />
          <div className="flex gap-1">
            {[DIAS_PRUEBA.normal, DIAS_PRUEBA.fundador].map(n => (
              <button key={n} type="button" onClick={() => sumar(n)} className="btn-ghost px-1.5 py-0.5 text-[11px]">hoy + {n}</button>
            ))}
          </div>
        </div>
      )}
      <label className="flex items-center gap-1.5 text-neutral-600">
        <input type="checkbox" checked={f.fundador} onChange={ev => setF({ ...f, fundador: ev.target.checked })} /> ⭐ Fundador
      </label>
      <div className="flex gap-1.5">
        <button onClick={guardar} className="btn-primary text-xs px-2 py-1">Guardar</button>
        <button onClick={() => setEditando(false)} className="btn-secondary text-xs px-2 py-1">Cancelar</button>
      </div>
    </div>
  )
}

/** Eliminar una empresa: muestra lo que se pierde y pide escribir su nombre (api DELETE, migración 068). */
function EliminarEmpresa({ e, onCancelar, onEliminada }: {
  e: Empresa; onCancelar: () => void; onEliminada: (msg: string) => void
}) {
  const [filas, setFilas] = useState<Record<string, number> | null>(null)
  const [texto, setTexto] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [borrando, setBorrando] = useState(false)

  useEffect(() => {
    fetch(`/api/plataforma/empresas/${e.id}`).then(r => r.json()).then(d => d.error ? setError(d.error) : setFilas(d.filas ?? {}))
      .catch(() => setError('No se pudo revisar la empresa'))
  }, [e.id])

  const NOMBRES: Record<string, string> = {
    sales: 'ventas', products: 'productos', purchase_orders: 'compras', import_orders: 'importaciones',
    inventory_movements: 'movimientos de inventario', ml_conexiones: 'cuentas de MercadoLibre conectadas',
    ml_preguntas: 'preguntas', ml_mensajes: 'mensajes', despacho_lotes: 'despachos', reportador_ordenes: 'órdenes reportadas',
    invoices: 'facturas', finance_movements: 'movimientos de finanzas', ia_uso: 'usos de IA (salen de Interno)',
  }
  const importantes = filas ? Object.entries(NOMBRES).filter(([t]) => filas[t]).map(([t, n]) => `${filas[t].toLocaleString('de-DE')} ${n}`) : []

  const eliminar = async () => {
    setBorrando(true); setError(null)
    const r = await fetch(`/api/plataforma/empresas/${e.id}`, {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmar: texto }),
    })
    const d = await r.json().catch(() => ({}))
    setBorrando(false)
    if (!r.ok) { setError(d.error ?? 'No se pudo eliminar'); return }
    onEliminada(`"${e.nombre}" eliminada con todos sus datos.` +
      (d.usuarios_borrados ? ` Se borraron ${d.usuarios_borrados} usuario(s).` : '') +
      (d.usuarios_desactivados ? ` ${d.usuarios_desactivados} usuario(s) quedaron desactivados (tenían registros globales).` : ''))
  }

  return (
    <section className="bg-white rounded-xl border-2 border-red-200 shadow-sm p-4 space-y-3">
      <h2 className="text-sm font-semibold text-red-800">Eliminar “{e.nombre}”</h2>
      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">{error}</div>}
      {e.is_active ? (
        <p className="text-sm text-neutral-700">Primero <b>desactívala</b> (columna Estado): sus usuarios dejan de entrar. Si solo quieres que no entre más, con eso basta y sus datos se conservan.</p>
      ) : !filas ? <p className="text-sm text-neutral-400">Revisando sus datos…</p> : (
        <>
          <p className="text-sm text-neutral-700">
            Se borra <b>para siempre</b> la empresa con todo lo suyo
            {importantes.length ? <>: {importantes.join(' · ')}</> : ' (no tiene ventas, productos ni cuentas de ML)'}.
            También sus usuarios que no entren a otra empresa. <b>No se puede deshacer.</b>
          </p>
          <label className="text-xs text-neutral-600 block">Para confirmar escribe el nombre exacto: <b>{e.nombre}</b>
            <input className={input} value={texto} onChange={ev => setTexto(ev.target.value)} autoComplete="off" />
          </label>
        </>
      )}
      <div className="flex gap-2">
        {!e.is_active && filas && (
          <button onClick={eliminar} disabled={borrando || texto.trim() !== e.nombre}
            className="px-3 py-1.5 rounded text-sm bg-red-600 text-white disabled:opacity-40">{borrando ? 'Eliminando…' : 'Eliminar para siempre'}</button>
        )}
        <button onClick={onCancelar} className="btn-secondary text-sm">Cancelar</button>
      </div>
    </section>
  )
}
