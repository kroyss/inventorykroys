'use client'
// Ventas → Por confirmar (2026-10-12): las ventas de MercadoLibre que todavía no están registradas
// (lib/porConfirmar.ts). Cada fila dice de un vistazo si se puede confirmar ya (productos, pago,
// mensaje del comprador) y "Confirmar" abre Nueva venta con todo cargado.
// Sin inventario (Pagos ME de los Fundadores, 19-10) es la MISMA lista: sin productos ni "Confirmar"; el pago
// se verifica en la fila (✓ / ✗) y la guía ya está en Despachos. Al activar inventario, gana esos dos pasos.
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { CargadaConPago, DespachadaFuera, NoConcretada, PorConfirmar as Fila } from '@/lib/porConfirmar'
import { MOTIVOS_NO_CONCRETADA, type MotivoNoConcretada } from '@/lib/noConcretada'
import ComprobarBanco from '@/components/pagosme/ComprobarBanco'
import { borrarMemoria, leerMemoria, recruzarMemoria, type EstadoGuardado } from '@/lib/bancoMemoria'
import LineaBanco from './LineaBanco'
import { BotonGuia } from './VerGuia'
import { BotonComprobante } from './VerComprobante'
import { Monto } from '@/components/pagosme/PagoME'
import { LoQueSeHablo } from './PagoYContexto'
import { NotasVenta } from '@/components/preguntas/MensajesClient'
import EnlazarLocal from './EnlazarLocal'
import { useTraidaME } from '@/components/pagosme/useTraidaME'
import { useSession } from 'next-auth/react'
import Link from '@/components/ui/Link'
import { rutaHabilitada } from '@/lib/modulos'
import { rutaPermitida } from '@/lib/permisos'
import { NumeritoAviso } from '@/components/layout/Avisos'
import { type DatosVigilante } from '@/components/pagosme/EstadoVigilante'
import VigilanteConConexion from '@/components/pagosme/ConexionME'
import { puede } from '@/lib/permisos'

const chipCls = 'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ring-1 ring-inset transition-colors'

/** Nota de la venta en MercadoLibre, editable (la misma de Mensajes y de Ventas), en una ventanita (23-10). Abre ya
 *  escribiendo y se cierra sola al guardar con Enter (01-11). Sombreada si la venta tiene nota (01-11). */
function ChipNota({ numero, tiene }: { numero: string; tiene: boolean }) {
  const [abierta, setAbierta] = useState(false)
  const [conNota, setConNota] = useState(tiene)
  useEffect(() => setConNota(tiene), [tiene])
  return (
    <>
      <button type="button" onClick={() => setAbierta(true)}
        title={conNota ? 'Tiene nota: ver y editar (el comprador no la ve)' : 'Escribir una nota de la venta en MercadoLibre (el comprador no la ve)'}
        className={`${chipCls} ${conNota ? 'bg-amber-50 text-amber-900 ring-amber-200 font-medium hover:bg-amber-100' : 'bg-white text-neutral-600 ring-neutral-200 hover:bg-neutral-50'}`}>📝 Nota</button>
      {abierta && createPortal(
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/30 p-4" onClick={() => setAbierta(false)}>
          <div className="w-full max-w-lg space-y-3 rounded-xl bg-white p-4 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-neutral-900">Nota de la venta <span className="font-mono text-xs text-neutral-400">{numero}</span></h3>
              <button type="button" onClick={() => setAbierta(false)} className="text-neutral-400 hover:text-neutral-700" aria-label="Cerrar">✕</button>
            </div>
            <NotasVenta pack={numero} onCambio={() => {}} onNotas={t => setConNota(!!t.trim())} directo onListo={() => setAbierta(false)} />
          </div>
        </div>, document.body)}
    </>
  )
}

interface Datos { dias: number; filas: Fila[]; ultimaBusqueda: string | null; pagosME: boolean; sincronizadas_at: string | null
  /** Ya cargadas en borrador cuyo pago trajo Pagos ME (22-10, solo con inventario). */
  cargadas?: CargadaConPago[]
  /** Marcadas "No se concretó" (mig 115), para ver y deshacer. */
  noConcretadas?: NoConcretada[]
  /** Marcadas "Ya la despaché por fuera" (mig 120, sin inventario), para ver y deshacer. */
  despachadasFuera?: DespachadaFuera[]
  conInventario?: boolean
  /** Quitadas de pendientes con «Sin inventario» (mig 183, con inventario), para ver y devolver. */
  sinInventario?: DespachadaFuera[] }
/** Recargar la lista desde cualquier fila (lo da PorConfirmar). */
const Recargar = createContext<() => Promise<void>>(async () => {})

async function pedirNoConcretada(numero: string, motivo: MotivoNoConcretada | null, nota: string | null) {
  const r = await fetch('/api/sales/por-confirmar', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ numero, motivo, nota }),
  })
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? 'No se pudo')
}

async function pedirFuera(numeros: string[], deshacer = false) {
  const r = await fetch('/api/sales/por-confirmar', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fuera: numeros, deshacer }),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error ?? 'No se pudo')
  return Number(j.n) || 0
}

/** "Ya la despaché por fuera" (24-10, sin inventario): se cumplió sin pasar por el sistema. Sale de la lista y en
 *  Calificaciones cuenta como concretada (la red de seguridad del día 6 ya no la toma por no concretada). */
function DespacheFuera({ f }: { f: Fila }) {
  const recargar = useContext(Recargar)
  const [haciendo, setHaciendo] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <span className="text-[11px]">
      <button type="button" disabled={haciendo} title="La despachaste sin usar el sistema: sale de esta lista y se califica como concretada"
        className="text-neutral-400 underline hover:text-emerald-700"
        onClick={async () => {
          setHaciendo(true); setError(null)
          try { await pedirFuera([f.numero]); await recargar() }
          catch (e) { setError(e instanceof Error ? e.message : 'No se pudo'); setHaciendo(false) }
        }}>Ya la despaché por fuera</button>
      {error && <span className="ml-1 text-red-700">{error}</span>}
    </span>
  )
}

async function pedirSinInventario(numeros: string[], deshacer = false) {
  let n = 0
  for (let i = 0; i < numeros.length; i += 500) {
    const r = await fetch('/api/sales/por-confirmar', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sin_inventario: numeros.slice(i, i + 500), deshacer }),
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(j.error ?? 'No se pudo')
    n += Number(j.n) || 0
  }
  return n
}

const nombreLinea = (f: Fila) => f.lineas.map(l => `${l.titulo}${l.variante ? ` (${l.variante})` : ''}`).join(' + ') || 'Sin producto'
const fechaCorta = (s: string) => new Date(s).toLocaleDateString('es-VE', { day: 'numeric', month: 'short' })

/** 17-11 (el dueño): «Sin inventario». Todas las ventas pendientes de registrar, agrupadas por producto: se marcan las que
 *  no se van a registrar (vendidas antes de llevar inventario, productos que no se cargaron) y salen de pendientes. No
 *  esconde productos a futuro: las ventas nuevas siguen llegando, la idea es cargar el inventario. Se pueden devolver. */
function QuitarSinInventario({ filas, onCerrar }: { filas: Fila[]; onCerrar: () => void }) {
  const recargar = useContext(Recargar)
  const grupos = (() => {
    const m = new Map<string, Fila[]>()
    for (const f of filas.filter(x => !x.concretadaSinVenta)) { const k = nombreLinea(f); m.set(k, [...(m.get(k) ?? []), f]) }
    return [...m.entries()].map(([nombre, fs]) => ({ nombre, filas: fs, foto: fs[0].lineas[0]?.foto ?? null }))
      .sort((a, b) => b.filas.length - a.filas.length || a.nombre.localeCompare(b.nombre))
  })()
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set())
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set())
  const [seguro, setSeguro] = useState(false)
  const [haciendo, setHaciendo] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // 17-11 (el dueño): las ya concretadas en ML sin venta van aparte y «Marcar todas» no las toma: si el producto tiene
  // inventario hay que registrarlas (ya se entregaron); se quitan solo una por una.
  const concretadas = filas.filter(f => f.concretadaSinVenta)
  const todas = filas.filter(f => !f.concretadaSinVenta).map(f => f.numero)
  const nTodas = todas.filter(x => marcadas.has(x)).length
  const cambiar = (nums: string[], si: boolean) => setMarcadas(prev => {
    const s = new Set(prev); nums.forEach(n => (si ? s.add(n) : s.delete(n))); return s
  })
  const quitar = async () => {
    setHaciendo(true); setError(null)
    try { await pedirSinInventario([...marcadas]); await recargar(); onCerrar() }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo'); setHaciendo(false) }
  }
  const n = marcadas.size
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 sm:items-center sm:p-4" role="dialog" aria-modal="true" onClick={onCerrar}>
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b px-5 py-3">
          <div>
            <h3 className="font-semibold text-neutral-900">Ventas sin inventario</h3>
            <p className="mt-0.5 text-xs text-neutral-500">Marca las ventas que no vas a registrar (por ejemplo, de antes de llevar inventario).
              Salen de pendientes y no restan en Stock en ML. Las ventas nuevas siguen llegando aquí: carga tu inventario para registrarlas.</p>
          </div>
          <button type="button" onClick={onCerrar} className="btn-ghost !px-2 !py-1" aria-label="Cerrar">✕</button>
        </div>
        <label className="flex items-center gap-2 border-b bg-neutral-50 px-5 py-2 text-sm">
          <input type="checkbox" checked={nTodas === todas.length && nTodas > 0} ref={el => { if (el) el.indeterminate = nTodas > 0 && nTodas < todas.length }}
            onChange={e => cambiar(todas, e.target.checked)} />
          <span className="font-medium text-neutral-800">Marcar todas</span>
          <span className="text-neutral-400">{todas.length} ventas · {grupos.length} productos</span>
        </label>
        <ul className="flex-1 divide-y divide-neutral-100 overflow-y-auto">
          {concretadas.length > 0 && (
            <li className="bg-amber-50/70 px-5 py-2.5">
              <p className="text-xs font-semibold text-amber-900">Concretadas en ML · revisa antes <span className="font-medium text-amber-700">{concretadas.length}</span></p>
              <p className="mt-0.5 text-[11px] text-amber-800">Ya se entregaron. Si el producto tiene inventario, regístralas (si no, el stock queda de más). «Marcar todas» no las toma: márcalas una por una solo si no llevan inventario.</p>
              <ul className="mt-2 divide-y divide-amber-100 rounded-lg border border-amber-200 bg-white">
                {concretadas.map(f => (
                  <li key={f.numero}>
                    <label className="flex items-center gap-2 px-3 py-1.5 text-xs">
                      <input type="checkbox" checked={marcadas.has(f.numero)} onChange={e => cambiar([f.numero], e.target.checked)} />
                      <span className="min-w-0 truncate text-neutral-800"><b className="font-medium">{f.comprador ?? f.nick ?? 'Sin nombre'}</b> · {nombreLinea(f)}</span>
                      <span className="ml-auto shrink-0 text-neutral-400">{fechaCorta(f.fecha)}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </li>
          )}
          {grupos.map(g => {
            const nums = g.filas.map(f => f.numero)
            const enG = nums.filter(x => marcadas.has(x)).length
            const abierto = abiertos.has(g.nombre)
            return (
              <li key={g.nombre}>
                <div className="flex items-center gap-3 px-5 py-2.5">
                  <input type="checkbox" aria-label={`Marcar ${g.nombre}`} checked={enG === nums.length}
                    ref={el => { if (el) el.indeterminate = enG > 0 && enG < nums.length }} onChange={e => cambiar(nums, e.target.checked)} />
                  {g.foto
                    ? <img src={g.foto} alt="" className="h-9 w-9 shrink-0 rounded-md border border-neutral-200 object-cover" loading="lazy" />
                    : <span className="h-9 w-9 shrink-0 rounded-md bg-neutral-100" aria-hidden="true" />}
                  <button type="button" onClick={() => setAbiertos(prev => { const s = new Set(prev); if (s.has(g.nombre)) s.delete(g.nombre); else s.add(g.nombre); return s })}
                    className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left">
                    <span className="min-w-0 truncate text-sm text-neutral-900">{g.nombre}</span>
                    <span className="shrink-0 text-xs text-neutral-500">
                      {enG > 0 && enG < nums.length ? `${enG} de ` : ''}{nums.length} {nums.length === 1 ? 'venta' : 'ventas'}
                      <span className="ml-1 text-neutral-400" aria-hidden="true">{abierto ? '▴' : '▾'}</span>
                    </span>
                  </button>
                </div>
                {abierto && (
                  <ul className="mb-2 ml-12 mr-5 divide-y divide-neutral-100 rounded-lg border border-neutral-100 bg-neutral-50/60">
                    {g.filas.map(f => (
                      <li key={f.numero}>
                        <label className="flex items-center gap-2 px-3 py-1.5 text-xs">
                          <input type="checkbox" checked={marcadas.has(f.numero)} onChange={e => cambiar([f.numero], e.target.checked)} />
                          <span className="font-medium text-neutral-800">{f.comprador ?? f.nick ?? 'Sin nombre'}</span>
                          <span className="text-neutral-400">{fechaCorta(f.fecha)} · {f.cuenta}</span>
                          {f.pago && f.pago.verificacion !== 'invalido' && <span className="text-sky-700">con pago</span>}
                          <span className="ml-auto font-mono text-[11px] text-neutral-400">{f.numero}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
        <div className="border-t bg-white px-5 py-3">
          {error && <p className="mb-2 text-xs text-red-700">{error}</p>}
          {seguro ? (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <span className="mr-auto text-xs text-neutral-600">¿Quitar {n} {n === 1 ? 'venta' : 'ventas'} de pendientes? Se pueden devolver después.</span>
              <button type="button" onClick={() => setSeguro(false)} disabled={haciendo} className="btn-secondary text-sm">Cancelar</button>
              <button type="button" onClick={quitar} disabled={haciendo} className="btn-primary text-sm disabled:opacity-50">{haciendo ? 'Quitando…' : 'Sí, quitar'}</button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button type="button" onClick={onCerrar} className="btn-ghost text-sm">Cerrar</button>
              <button type="button" onClick={() => setSeguro(true)} disabled={!n} className="btn-primary text-sm disabled:opacity-50">
                Quitar {n || ''} de pendientes</button>
            </div>
          )}
        </div>
      </div>
    </div>, document.body)
}

/** Las quitadas con «Sin inventario» (mig 183): quién y cuándo, y «Devolver» a pendientes. */
function ListaQuitadas({ filas }: { filas: DespachadaFuera[] }) {
  const recargar = useContext(Recargar)
  const [ver, setVer] = useState(false)
  const [haciendo, setHaciendo] = useState<string | null>(null)
  if (!filas.length) return null
  const devolver = async (nums: string[], clave: string) => {
    setHaciendo(clave); try { await pedirSinInventario(nums, true); await recargar() } finally { setHaciendo(null) }
  }
  return (
    <div className="rounded-xl border border-neutral-200 bg-neutral-50/60">
      <button type="button" onClick={() => setVer(v => !v)} className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left">
        <span className="text-sm font-medium text-neutral-600">Quitadas por sin inventario <span className="text-neutral-400">{filas.length}</span></span>
        <span className="text-xs text-neutral-400">No piden registro ni restan en Stock en ML · {ver ? 'Ocultar' : 'Ver'}</span>
      </button>
      {ver && (
        <ul className="divide-y divide-neutral-100 border-t border-neutral-200 bg-white">
          {filas.length > 1 && (
            <li className="flex justify-end px-4 py-2">
              <button type="button" disabled={!!haciendo} onClick={() => devolver(filas.map(f => f.numero), '*')}
                className="text-xs font-medium text-neutral-600 underline hover:text-neutral-900 disabled:opacity-50">
                {haciendo === '*' ? 'Devolviendo…' : `Devolver las ${filas.length} a pendientes`}</button>
            </li>
          )}
          {filas.map(n => (
            <li key={n.numero} className="flex flex-col gap-1 px-4 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <span className="font-medium text-neutral-900">{n.comprador ?? n.nick ?? 'Sin nombre'}</span>
                <span className="ml-2 font-mono text-[11px] text-neutral-400">{n.numero}</span>
                {n.productos && <div className="truncate text-xs text-neutral-500">{n.productos}</div>}
                <div className="text-xs text-neutral-400">Quitada por {n.por ?? '—'} · {hora(n.at)}</div>
              </div>
              <button type="button" disabled={!!haciendo} className="self-start text-xs text-neutral-500 underline hover:text-neutral-800 disabled:opacity-50 sm:self-center"
                onClick={() => devolver([n.numero], n.numero)}>
                {haciendo === n.numero ? 'Devolviendo…' : 'Devolver'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ListaFuera({ filas }: { filas: DespachadaFuera[] }) {
  const recargar = useContext(Recargar)
  const [ver, setVer] = useState(false)
  const [haciendo, setHaciendo] = useState<string | null>(null)
  if (!filas.length) return null
  return (
    <div className="rounded-xl border border-neutral-200 bg-neutral-50/60">
      <button type="button" onClick={() => setVer(v => !v)} className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left">
        <span className="text-sm font-medium text-neutral-600">Despachadas por fuera <span className="text-neutral-400">{filas.length}</span></span>
        <span className="text-xs text-neutral-400">Se califican como concretadas · {ver ? 'Ocultar' : 'Ver'}</span>
      </button>
      {ver && (
        <ul className="divide-y divide-neutral-100 border-t border-neutral-200 bg-white">
          {filas.map(n => (
            <li key={n.numero} className="flex flex-col gap-1 px-4 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <span className="font-medium text-neutral-900">{n.comprador ?? n.nick ?? 'Sin nombre'}</span>
                <span className="ml-2 font-mono text-[11px] text-neutral-400">{n.numero}</span>
                {n.productos && <div className="truncate text-xs text-neutral-500">{n.productos}</div>}
                <div className="text-xs text-neutral-400">{n.por ?? 'Completada en MercadoEnvíos'} · {hora(n.at)}</div>
              </div>
              <button type="button" disabled={haciendo === n.numero} className="self-start text-xs text-neutral-500 underline hover:text-neutral-800 sm:self-center"
                onClick={async () => { setHaciendo(n.numero); try { await pedirFuera([n.numero], true); await recargar() } finally { setHaciendo(null) } }}>
                Deshacer
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** "No se concretó" (23-10): se pagó pero no se pudo cumplir y se devolvió. ML no avisa la cancelación hasta calificar,
 *  así que la marca la persona: sale de Por confirmar y Calificaciones la sugiere no concretada. El pago NO cambia. */
function NoSeConcreto({ f }: { f: Fila }) {
  const recargar = useContext(Recargar)
  const [abierto, setAbierto] = useState(false)
  const [motivo, setMotivo] = useState<MotivoNoConcretada | null>(f.sinStock ? 'sin_stock' : null)
  const [nota, setNota] = useState('')
  const [haciendo, setHaciendo] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!abierto) return (
    <button type="button" onClick={() => setAbierto(true)} className="text-[11px] text-neutral-400 underline hover:text-red-700">No se concretó</button>
  )
  const listo = !!motivo && (motivo !== 'otro' || nota.trim().length >= 2)
  return (
    <div className="w-full space-y-2 rounded-lg border border-red-200 bg-red-50/50 p-3 text-xs sm:w-72">
      <p className="font-medium text-neutral-800">¿Por qué no se concretó?</p>
      {f.sinStock && <p className="text-[11px] text-red-700">El sistema ve que no hay stock suficiente.</p>}
      <div className="space-y-1">
        {(Object.entries(MOTIVOS_NO_CONCRETADA) as [MotivoNoConcretada, string][]).map(([k, t]) => (
          <label key={k} className="flex items-center gap-2"><input type="radio" checked={motivo === k} onChange={() => setMotivo(k)} /> {t}</label>
        ))}
      </div>
      <input value={nota} onChange={e => setNota(e.target.value)} maxLength={300}
        placeholder={motivo === 'otro' ? 'Qué pasó (obligatorio)' : 'Nota (opcional)'} className="w-full rounded border border-neutral-300 bg-white px-2 py-1.5 text-sm" />
      <p className="text-[11px] text-neutral-500">Sale de esta lista y en Calificaciones queda como no concretada. El pago no cambia. Se puede deshacer.</p>
      {error && <p className="text-red-700">{error}</p>}
      <div className="flex gap-2">
        <button type="button" disabled={!listo || haciendo} className="btn-primary flex-1 text-xs" onClick={async () => {
          setHaciendo(true); setError(null)
          try { await pedirNoConcretada(f.numero, motivo, nota.trim() || null); await recargar() }
          catch (e) { setError(e instanceof Error ? e.message : 'No se pudo'); setHaciendo(false) }
        }}>Marcar no concretada</button>
        <button type="button" onClick={() => setAbierto(false)} className="btn-secondary text-xs">Cancelar</button>
      </div>
    </div>
  )
}

function ListaNoConcretadas({ filas }: { filas: NoConcretada[] }) {
  const recargar = useContext(Recargar)
  const [ver, setVer] = useState(false)
  const [haciendo, setHaciendo] = useState<string | null>(null)
  if (!filas.length) return null
  return (
    <div className="rounded-xl border border-neutral-200 bg-neutral-50/60">
      <button type="button" onClick={() => setVer(v => !v)} className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left">
        <span className="text-sm font-medium text-neutral-600">No se concretaron <span className="text-neutral-400">{filas.length}</span></span>
        <span className="text-xs text-neutral-400">Marcadas a mano (reembolsadas) · {ver ? 'Ocultar' : 'Ver'}</span>
      </button>
      {ver && (
        <ul className="divide-y divide-neutral-100 border-t border-neutral-200 bg-white">
          {filas.map(n => (
            <li key={n.numero} className="flex flex-col gap-1 px-4 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <span className="font-medium text-neutral-900">{n.comprador ?? n.nick ?? 'Sin nombre'}</span>
                <span className="ml-2 font-mono text-[11px] text-neutral-400">{n.numero}</span>
                {n.productos && <div className="truncate text-xs text-neutral-500">{n.productos}</div>}
                <div className="text-xs text-red-700">
                  {MOTIVOS_NO_CONCRETADA[n.motivo] ?? n.motivo}{n.nota ? ` · “${n.nota}”` : ''}
                  <span className="text-neutral-400"> · {n.por ?? '—'} · {hora(n.at)}</span>
                </div>
              </div>
              <button type="button" disabled={haciendo === n.numero} className="self-start text-xs text-neutral-500 underline hover:text-neutral-800 sm:self-center"
                onClick={async () => { setHaciendo(n.numero); try { await pedirNoConcretada(n.numero, null, null); await recargar() } finally { setHaciendo(null) } }}>
                Deshacer
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
/** Sin inventario: verificar el pago desde la fila (Pagos ME). */
type Verificar = (pagoId: number, v: 'valido' | 'invalido' | 'pendiente') => Promise<void>

const hora = (s: string | null) => s ? new Date(s).toLocaleString('es-VE', {
  timeZone: 'America/Caracas', day: '2-digit', month: '2-digit', hour: 'numeric', minute: '2-digit',
}) : '—'

function hace(s: string) {
  const min = Math.max(0, Math.round((Date.now() - new Date(s).getTime()) / 60000))
  if (min < 60) return `hace ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.floor(h / 24)
  return `hace ${d} día${d === 1 ? '' : 's'}`
}

const usd = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

type Tono = 'verde' | 'ambar' | 'rojo' | 'azul' | 'gris'
const TONO: Record<Tono, string> = {
  verde: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  ambar: 'bg-amber-50 text-amber-800 ring-amber-200',
  rojo: 'bg-red-50 text-red-800 ring-red-200',
  azul: 'bg-sky-50 text-sky-800 ring-sky-200',
  gris: 'bg-neutral-50 text-neutral-600 ring-neutral-200',
}
const PUNTO: Record<Tono, string> = {
  verde: 'bg-emerald-500', ambar: 'bg-amber-500', rojo: 'bg-red-500', azul: 'bg-sky-500', gris: 'bg-neutral-400',
}

function Etiqueta({ tono, children, title }: { tono: Tono; children: React.ReactNode; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${TONO[tono]}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${PUNTO[tono]}`} aria-hidden="true" />
      {children}
    </span>
  )
}

/** 16-11 (el dueño): «Pago por verificar» se toca y se confirma ahí mismo (válido / inválido), sin abrir la venta. */
function ChipVerificar({ texto, monto, quien, haciendo, onElegir }: {
  texto: string; monto: number | null | undefined; quien: string | null; haciendo: boolean
  onElegir: (v: 'valido' | 'invalido') => Promise<void>
}) {
  const [abierto, setAbierto] = useState(false)
  const boton = useRef<HTMLButtonElement>(null)
  const caja = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!abierto) return
    const fuera = (e: MouseEvent) => {
      const t = e.target as Node
      if (!caja.current?.contains(t) && !boton.current?.contains(t)) setAbierto(false)
    }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false) }
    document.addEventListener('mousedown', fuera); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', esc) }
  }, [abierto])
  const elegir = async (v: 'valido' | 'invalido') => { await onElegir(v); setAbierto(false) }
  return (
    <>
      <button ref={boton} type="button" onClick={() => setAbierto(a => !a)} aria-expanded={abierto} title="Toca para marcar el pago como verificado"
        className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${TONO.azul} hover:ring-sky-400`}>
        <span className={`h-1.5 w-1.5 rounded-full ${PUNTO.azul}`} aria-hidden="true" />
        {texto}
        <span className="ml-0.5 opacity-60" aria-hidden="true">▾</span>
      </button>
      {abierto && (
        // En el flujo de la fila (no flotante): la lista tiene overflow-hidden y lo cortaría en la última fila.
        <span ref={caja} role="dialog" className="order-last basis-full rounded-xl border border-sky-200 bg-white p-3 text-left text-sm shadow-sm sm:max-w-sm">
          <span className="block text-neutral-800">
            ¿El pago{monto != null ? <> de <b>Bs {usd(monto)}</b></> : ''}{quien ? <> de {quien}</> : ''} llegó bien?
          </span>
          <span className="mt-2.5 flex flex-wrap items-center gap-2">
            <button type="button" disabled={haciendo} onClick={() => elegir('valido')} className="btn-primary px-3 py-1 text-xs disabled:opacity-50">
              {haciendo ? 'Guardando…' : '✓ Sí, verificado'}</button>
            <button type="button" disabled={haciendo} onClick={() => elegir('invalido')} className="btn-secondary px-3 py-1 text-xs text-red-700 disabled:opacity-50">✗ Inválido</button>
            <button type="button" onClick={() => setAbierto(false)} className="text-xs text-neutral-500 underline">cancelar</button>
          </span>
        </span>
      )}
    </>
  )
}

function IconoActualizar({ girando }: { girando: boolean }) {
  return (
    <svg className={`h-4 w-4 ${girando ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 11a8 8 0 1 0-2.3 5.7" />
      <path d="M20 5v6h-6" />
    </svg>
  )
}

function estadoProductos(f: Fila): { tono: Tono; texto: string; title: string } {
  if (f.productos === 'listo') return { tono: 'verde', texto: 'Productos listos', title: 'Cada publicación está vinculada a un solo producto' }
  if (f.productos === 'elegir') return { tono: 'ambar', texto: 'Elegir producto', title: 'Una publicación está en varios productos: hay que elegir cuál se vendió' }
  return { tono: 'ambar', texto: 'Sin vincular', title: 'Una publicación no está vinculada a ningún producto: hay que buscarlo a mano' }
}

function estadoPago(f: Fila, ultima: string | null): { tono: Tono; texto: string; title?: string } {
  if (f.pago?.verificacion === 'valido') return { tono: 'verde', texto: 'Pago verificado' }
  if (f.pago?.verificacion === 'invalido') return { tono: 'rojo', texto: 'Pago inválido' }
  if (f.pago) return { tono: 'azul', texto: `Pago por verificar${f.pago.monto ? ` · Bs ${usd(f.pago.monto)}` : ''}` }
  if (!ultima || new Date(ultima) < new Date(f.fecha)) return { tono: 'gris', texto: 'Pago sin buscar', title: `La última búsqueda de pagos (${hora(ultima)}) fue antes de la compra` }
  return { tono: 'ambar', texto: 'No ha pagado', title: `Se buscó el ${hora(ultima)} y no apareció: no ha pagado o no subió el comprobante` }
}

const METODO: Record<string, string> = { mobile_payment: 'Pago móvil', transfer: 'Transferencia', zelle: 'Zelle' }

function FilaVenta({ f, d, onConfirmar, onVerificar, onPago, onPagoChip }: {
  f: Fila; d: Datos; onConfirmar: (numero: string) => void; onVerificar?: Verificar
  /** Con inventario en un cliente (25-10): también se verifica el pago en la fila, además de registrar la venta. */
  onPago?: Verificar
  /** 16-11 (el dueño): el chip «Pago por verificar» se verifica de un toque (como cuando cuadra con el banco). */
  onPagoChip?: Verificar
}) {
  const sinInventario = !!onVerificar
  // monto, comprobante («ver pago») y datos del pago a la vista. 16-11 (el dueño): también en Ventas → Por confirmar con
  // Pagos ME, igual que en Pagos ME (que las dos se vean y trabajen igual).
  const verPago = sinInventario || !!onPago || !!onPagoChip
  const [haciendo, setHaciendo] = useState(false)
  const verificar = async (v: 'valido' | 'invalido' | 'pendiente') => {
    const fn = onVerificar ?? onPago ?? onPagoChip
    if (!fn || !f.pago) return
    setHaciendo(true)
    try { await fn(f.pago.id, v) } finally { setHaciendo(false) }
  }
  const prod = estadoProductos(f)
  const pago = d.pagosME ? estadoPago(f, d.ultimaBusqueda) : null
  const quedan = d.dias - Math.floor((Date.now() - new Date(f.fecha).getTime()) / 86_400_000)
  return (
    <li className="group flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center hover:bg-neutral-50/70">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="font-semibold text-neutral-900 truncate">{f.comprador ?? f.nick ?? 'Sin nombre'}</span>
          {f.comprador && f.nick && <span className="text-xs text-neutral-400">@{f.nick}</span>}
          <span className="font-mono text-[11px] text-neutral-400">{f.numero}</span>
        </div>
        <div className="text-sm text-neutral-700 space-y-0.5">
          {f.lineas.map((l, k) => (
            <div key={k} className="flex min-w-0 items-center gap-2" title={l.titulo}>
              {/* Foto (01-11): para reconocer el producto sin abrir la conversación. */}
              {l.foto
                ? <img src={l.foto} alt="" loading="lazy" className="h-10 w-10 shrink-0 rounded-md bg-white object-contain ring-1 ring-neutral-200" />
                : <span className="h-10 w-10 shrink-0 rounded-md bg-neutral-100 ring-1 ring-neutral-200" aria-hidden="true" />}
              <span className="min-w-0 truncate">
                {/* La variante va antes del título: en títulos largos quedaba cortada al final. */}
                <span className="font-medium">{l.cantidad} ×</span>{' '}
                {l.variante && <span className="mr-1 inline-block rounded-full bg-sky-50 px-1.5 py-px text-[11px] font-medium text-sky-800 ring-1 ring-inset ring-sky-200 align-middle">{l.variante}</span>}
                {l.titulo}
              </span>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          {!sinInventario && <Etiqueta tono={prod.tono} title={prod.title}>{prod.texto}</Etiqueta>}
          {pago && (onVerificar ?? onPago ?? onPagoChip) && f.pago?.verificacion === 'pendiente'
            ? <ChipVerificar texto={pago.texto} monto={f.pago.monto} quien={f.comprador ?? f.nick} haciendo={haciendo} onElegir={verificar} />
            : pago && <Etiqueta tono={pago.tono} title={pago.title}>{pago.texto}</Etiqueta>}
          {pago && onPagoChip && !onVerificar && !onPago && f.pago?.verificacion === 'valido' && (
            <button type="button" onClick={() => verificar('pendiente')} disabled={haciendo}
              title="Vuelve a «Pago por verificar»" className="text-[11px] text-neutral-400 underline hover:text-neutral-700 disabled:opacity-50">deshacer</button>
          )}
          {pago && onPagoChip && !onVerificar && !onPago && f.pago?.verificacion === 'invalido' && (
            <button type="button" onClick={() => verificar('pendiente')} disabled={haciendo}
              className="text-[11px] text-neutral-500 underline hover:text-neutral-800 disabled:opacity-50">volver a revisar</button>
          )}
          {verPago && f.pago && f.pago.verificacion === 'pendiente' && f.pago.monto != null && (
            <Monto p={{ monto_pagado: f.pago.monto, total_orden: f.pago.totalOrden }} banco={!!f.pago.bancoRes} />
          )}
          {f.antesInventario && (
            <Etiqueta tono="gris" title="La compraron en MercadoLibre antes de que activaras el inventario, pero sigue en curso: confirma el pago. Si la registras, se descuenta del stock">
              Comprada antes de activar el inventario
            </Etiqueta>
          )}
          {f.pago?.retiro && <Etiqueta tono="ambar" title="El comprador pasa a buscarlo: no lleva guía ni pasa por Despachos">🏪 Retiro en tienda</Etiqueta>}
          {/* Solo vence la que no tiene pago (26-10: salía "Vence hoy" en una venta pagada y ya despachada). */}
          {!f.vencida && quedan <= 2 && (!f.pago || f.pago.verificacion === 'invalido') && <Etiqueta tono="rojo">{quedan <= 0 ? 'Vence hoy' : `Quedan ${quedan} día${quedan === 1 ? '' : 's'}`}</Etiqueta>}
          <span className="text-[11px] text-neutral-400">
            compró {hace(f.fecha)}{f.pago?.at ? ` · pago traído ${hace(f.pago.at)}` : ''} · {f.cuenta}
          </span>
          {f.pago?.guia && <BotonGuia pagoId={f.pago.id} venta={f.numero} />}
          {/* 23-10: lo mismo que ve el equipo al verificar (Ventas): la conversación con el comprador y la nota de la venta. */}
          {/* 01-11: sombreada si el comprador escribió algo después de comprar (aunque ya se le haya contestado); blanca =
              no escribió nada, la venta es tal cual. Al pasar el mouse, sus últimos mensajes. */}
          <LoQueSeHablo numero={f.numero} chip
            titulo={f.escribio.length ? `Escribió:\n${f.escribio.map(t => `• ${t}`).join('\n')}` : 'El comprador no escribió después de comprar'}
            className={`${chipCls} ${f.escribio.length ? 'bg-sky-50 text-sky-800 ring-sky-200 font-medium hover:bg-sky-100' : 'bg-white text-neutral-600 ring-neutral-200 hover:bg-neutral-50'}`}
            etiqueta={<>💬 {f.mensaje ? 'Escribió' : 'Conversación'} ›</>} />
          <ChipNota numero={f.numero} tiene={f.nota} />
          {f.despacho && (
            <Etiqueta tono={f.despacho === 'en_lote' ? 'gris' : 'verde'}
              title={f.despacho === 'reportada' ? 'Su guía salió impresa y el Reportador ya se la escribió al comprador'
                : f.despacho === 'impresa' ? 'Su guía ya salió impresa en Despachos' : 'Su guía ya está cargada en Despachos, todavía sin imprimir'}>
              {f.despacho === 'reportada' ? '✓ Despachada y reportada' : f.despacho === 'impresa' ? '✓ Guía ya impresa' : 'Guía en Despachos'}
            </Etiqueta>
          )}
          {verPago && f.pago?.comprobante && (
            <BotonComprobante pagoId={f.pago.id} venta={f.numero}
              datos={{ monto: f.pago.monto, totalOrden: f.pago.totalOrden, banco: f.pago.banco, referencia: f.pago.referencia, metodo: f.pago.metodo }} />
          )}
        </div>
        {/* Lo que dijo el banco (20-10, "Comprobar con el banco"): para verificar sabiendo qué llegó de verdad. */}
        {f.pago?.bancoRes && f.pago.verificacion !== 'invalido' && <LineaBanco b={f.pago.bancoRes} />}
        {verPago && f.pago && (
          <div className="text-[11px] text-neutral-500">
            {[METODO[f.pago.metodo ?? ''] ?? f.pago.metodo, f.pago.banco, f.pago.referencia && `ref. ${f.pago.referencia}`,
              f.pago.guiaNum && `${f.pago.carrier ? f.pago.carrier.toUpperCase() + ' ' : 'guía '}${f.pago.guiaNum}`].filter(Boolean).join(' · ')}
          </div>
        )}
        {f.mensaje && (
          <div className="mt-1 flex items-start gap-1.5 rounded-lg bg-violet-50 px-2.5 py-1.5 text-xs text-violet-900 ring-1 ring-inset ring-violet-200">
            <svg className="mt-px h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
            </svg>
            <span className="min-w-0"><b>Escribió después de comprar:</b> <span className="line-clamp-2">{f.mensaje.texto}</span></span>
          </div>
        )}
      </div>
      <div className="flex flex-col items-start gap-2 sm:items-end">
      {sinInventario ? (
        f.pago?.verificacion === 'pendiente' ? (
          <div className="flex gap-2 self-start sm:self-center">
            <button type="button" onClick={() => verificar('valido')} disabled={haciendo} className="btn-primary text-sm whitespace-nowrap">✓ Pago correcto</button>
            <button type="button" onClick={() => verificar('invalido')} disabled={haciendo} className="btn-secondary text-sm whitespace-nowrap text-red-700">✗ Inválido</button>
          </div>
        ) : f.pago?.verificacion === 'valido' ? (
          <div className="flex flex-col items-end gap-1 self-start sm:self-center">
            <a href="/despachos" className="btn-secondary text-sm whitespace-nowrap">Ir a Despachos →</a>
            <button type="button" onClick={() => verificar('pendiente')} disabled={haciendo} className="text-[11px] text-neutral-400 underline hover:text-neutral-700">deshacer</button>
          </div>
        ) : f.pago?.verificacion === 'invalido' ? (
          <button type="button" onClick={() => verificar('pendiente')} disabled={haciendo}
            className="text-xs text-neutral-500 underline self-start sm:self-center">Volver a revisar</button>
        ) : null
      ) : onPago && f.pago?.verificacion === 'pendiente' ? (
        // Cliente con inventario (25-10): primero el pago (como en Pagos ME), y se puede registrar igual.
        <div className="flex flex-col items-end gap-1 self-start sm:self-center">
          <div className="flex gap-2">
            <button type="button" onClick={() => verificar('valido')} disabled={haciendo} className="btn-primary text-sm whitespace-nowrap">✓ Pago correcto</button>
            <button type="button" onClick={() => verificar('invalido')} disabled={haciendo} className="btn-secondary text-sm whitespace-nowrap text-red-700">✗ Inválido</button>
          </div>
          <button type="button" onClick={() => onConfirmar(f.numero)} className="text-[11px] text-neutral-500 underline hover:text-neutral-800">Registrar venta</button>
        </div>
      ) : (
        <div className="flex flex-col items-end gap-1 self-start sm:self-center">
          {/* "Verificar" (22-10, pedido del dueño): abre la venta para revisarla; recién adentro se confirma y procesa.
              25-10: con el pago ya verificado lo que falta es registrarla → "Registrar venta". */}
          <button type="button" onClick={() => onConfirmar(f.numero)} className="btn-primary text-sm whitespace-nowrap">
            {f.pago?.verificacion === 'valido' ? 'Registrar venta' : 'Verificar'}
          </button>
          {onPago && f.pago?.verificacion === 'valido' && (
            <button type="button" onClick={() => verificar('pendiente')} disabled={haciendo} className="text-[11px] text-neutral-400 underline hover:text-neutral-700">deshacer pago</button>
          )}
          {onPago && f.pago?.verificacion === 'invalido' && (
            <button type="button" onClick={() => verificar('pendiente')} disabled={haciendo} className="text-[11px] text-neutral-500 underline">Volver a revisar el pago</button>
          )}
        </div>
      )}
      <NoSeConcreto f={f} />
      {sinInventario && f.despacho !== 'impresa' && f.despacho !== 'reportada' && <DespacheFuera f={f} />}
      </div>
    </li>
  )
}

function Grupo({ titulo, nota, filas, d, onConfirmar, plegable, onVerificar, onPago, onPagoChip }: {
  titulo: string; nota: string; filas: Fila[]; d: Datos; onConfirmar: (numero: string) => void; plegable?: boolean; onVerificar?: Verificar; onPago?: Verificar
  onPagoChip?: Verificar
}) {
  const [abierto, setAbierto] = useState(!plegable)
  if (!filas.length) return null
  return (
    <section className="border-b border-neutral-100 last:border-b-0">
      <button type="button" onClick={() => plegable && setAbierto(a => !a)} disabled={!plegable}
        className={`flex w-full items-baseline gap-2 bg-neutral-50 px-4 py-2 text-left ${abierto ? 'border-b border-neutral-100' : ''} ${plegable ? 'hover:bg-neutral-100' : 'cursor-default'}`}>
        {plegable && (
          <svg className={`h-3 w-3 self-center text-neutral-400 transition-transform ${abierto ? 'rotate-90' : ''}`} viewBox="0 0 24 24"
            fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 6l6 6-6 6" />
          </svg>
        )}
        <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-600">{titulo}</h3>
        <span className="text-xs font-medium text-neutral-400">{filas.length}</span>
        <span className="hidden sm:inline text-[11px] text-neutral-400">· {nota}</span>
        {plegable && <span className="ml-auto text-[11px] text-neutral-400">{abierto ? 'Ocultar' : 'Ver'}</span>}
      </button>
      {abierto && (
        <ul className="divide-y divide-neutral-100">
          {filas.map(f => <FilaVenta key={f.numero} f={f} d={d} onConfirmar={onConfirmar} onVerificar={onVerificar} onPago={onPago} onPagoChip={onPagoChip} />)}
        </ul>
      )}
    </section>
  )
}

// ── Ya cargadas · pago por verificar (22-10-2026) ───────────────────────────
// Ventas que se cargaron a mano antes de que llegara el pago (p. ej. para facturar con retención) y cuyo pago ya trajo
// Pagos ME. "Verificar" (como en las demás filas) abre ESA venta en la pantalla de siempre (Editar venta): ahí se
// revisa el pago, lo que compró en ML, productos y nota, y se procesa con "Actualizar y procesar". Nada se mueve solo.
function FilaCargada({ c, onVerificar }: { c: CargadaConPago; onVerificar: (saleId: number) => void }) {
  return (
    <li className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center hover:bg-neutral-50/70">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="truncate font-semibold text-neutral-900">{c.cliente ?? 'Sin nombre'}</span>
          <span className="font-mono text-[11px] text-neutral-400">{c.numero}</span>
        </div>
        <div className="space-y-0.5 text-sm text-neutral-700">
          {c.productos.map((p, k) => <div key={k} className="truncate"><span className="font-medium">{p.cantidad} ×</span> {p.nombre}</div>)}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          <Etiqueta tono="ambar" title="Cargada a mano antes de que llegara el pago: sigue en borrador hasta verificar el pago">Borrador · ya cargada</Etiqueta>
          {c.factura && <Etiqueta tono="gris" title="Ya tiene factura emitida">Factura #{c.factura}</Etiqueta>}
          {c.pago.verificacion === 'valido'
            ? <Etiqueta tono="verde">Pago ya verificado · falta procesar</Etiqueta>
            : c.pago.monto != null && <Monto p={{ monto_pagado: c.pago.monto, total_orden: c.pago.totalOrden }} banco={!!c.pago.bancoRes} />}
          <span className="text-[11px] text-neutral-400">pago traído {hace(c.pago.at)}</span>
          {c.pago.guia && <BotonGuia pagoId={c.pago.id} venta={c.numero} />}
          {c.pago.comprobante && (
            <BotonComprobante pagoId={c.pago.id} venta={c.numero}
              datos={{ monto: c.pago.monto, totalOrden: c.pago.totalOrden, banco: c.pago.banco, referencia: c.pago.referencia, metodo: c.pago.metodo }} />
          )}
        </div>
        {c.pago.bancoRes && <LineaBanco b={c.pago.bancoRes} />}
      </div>
      <button type="button" onClick={() => onVerificar(c.sale_id)}
        className="btn-primary text-sm whitespace-nowrap self-start sm:self-center">
        Verificar
      </button>
    </li>
  )
}

export default function PorConfirmar({ datos, onRecargar, onConfirmar, onVerificar, onVerificarCargada, onVerificarPago, onPagoChip, enPagosME = false }: {
  datos: Datos | null
  onRecargar: () => Promise<void>
  onConfirmar: (numero: string) => void
  /** Ya cargadas (22-10): abre la venta existente en Editar venta. */
  onVerificarCargada?: (saleId: number) => void
  /** Sin inventario (Pagos ME de los Fundadores): se verifica el pago en la fila, sin "Confirmar". */
  onVerificar?: Verificar
  /** Con inventario en un cliente (25-10): ✓ / ✗ del pago en la fila, como en Pagos ME (es el mismo pago). */
  onVerificarPago?: Verificar
  /** 16-11: verificar el pago tocando su chip (Ventas → Por confirmar con Pagos ME). */
  onPagoChip?: Verificar
  /** Dentro de Pagos ME (18-11): la línea de estado de la PC ya está arriba, no se repite. */
  enPagosME?: boolean
}) {
  const sinInventario = !!onVerificar
  const [actualizando, setActualizando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [revisado, setRevisado] = useState<{ at: string; nuevas: number } | null>(null)
  const [verVencidas, setVerVencidas] = useState(false)
  // 12-11 (el dueño): las notas escritas en ML no llegaban (ML no avisa y «Traer ML» no las trae). Al cargar la lista se
  // releen en segundo plano las de sus ventas (las de más de 5 min) y la marca amarilla se actualiza sola.
  const [notasML, setNotasML] = useState<Record<string, boolean>>({})
  useEffect(() => {
    if (!datos?.filas.length) return
    let vivo = true
    fetch('/api/sales/por-confirmar/notas', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ numeros: datos.filas.map(f => f.numero) }) })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (vivo && d?.notas && Object.keys(d.notas).length) setNotasML(prev => ({ ...prev, ...d.notas })) })
      .catch(() => {})
    return () => { vivo = false }
  }, [datos])
  // Buscador (20-10): nombre, apodo de ML, número de venta, producto o cuenta.
  const [buscar, setBuscar] = useState('')
  // 22-11: «Confirmar pago →» de Despachos llega con ?buscar=<venta>: la lista abre filtrada en esa venta.
  useEffect(() => {
    try {
      const b = new URLSearchParams(window.location.search).get('buscar')
      // eslint-disable-next-line react-hooks/set-state-in-effect -- se lee de la URL después de montar
      if (b) setBuscar(b)
    } catch { /* nada */ }
  }, [])
  // "Traer ME" (2026-10-12; Pagos ME salió del menú de los usuarios): le pide a la PC del vigilante que traiga
  // los pagos y guías del portal. Tarda 1-3 min: se recarga la lista cada 10 s hasta que llega la búsqueda nueva.
  const [pidiendoME, setPidiendoME] = useState<number | null>(null)
  const [avisoME, setAvisoME] = useState<string | null>(null)
  // 12-11 (el dueño): la traída en curso sale del servidor: si ya hay una (pedida aquí, en otra pantalla o por otra
  // persona), el botón queda «Buscando…» aunque se recargue la página, y no se pide otra. Cada traída se toma una vez.
  const tme = useTraidaME(!!datos?.pagosME)
  const tomada = useRef<number | null>(null)
  useEffect(() => {
    const t = tme.traida
    if (!tme.ocupada || !t || tomada.current === t.id || pidiendoME != null) return
    tomada.current = t.id
    setPidiendoME(new Date(t.pedido_at).getTime())
  }, [tme.ocupada, tme.traida, pidiendoME])
  // "Comprobar con el banco" (20-10): cualquier usuario sube los estados de cuenta; el resultado queda en cada venta.
  const [banco, setBanco] = useState(false)
  // 17-11: «Sin inventario» (quitar de pendientes las que no se van a registrar).
  const [sinInv, setSinInv] = useState(false)
  // Estados de cuenta de hoy en este navegador (22-10, lib/bancoMemoria.ts): cuando llegan pagos nuevos sin lo que
  // dijo el banco, se cruzan solos. `cruzados` = los pagos ya intentados (los que no aparecen no se reintentan en bucle).
  const [memoria, setMemoria] = useState<EstadoGuardado[]>(() => typeof window === 'undefined' ? [] : leerMemoria())
  useEffect(() => {
    const leer = () => setMemoria(leerMemoria())
    window.addEventListener('banco-memoria', leer)
    return () => window.removeEventListener('banco-memoria', leer)
  }, [])
  const cruzados = useRef(new Set<string>())
  useEffect(() => {
    if (!datos?.pagosME || !memoria.length || banco) return
    const sinBanco = [
      ...datos.filas.filter(f => f.pago?.verificacion === 'pendiente' && !f.pago.bancoRes).map(f => f.numero),
      ...(datos.cargadas ?? []).filter(c => !c.pago.bancoRes).map(c => c.numero),
    ].filter(n => !cruzados.current.has(n))
    if (!sinBanco.length) return
    sinBanco.forEach(n => cruzados.current.add(n))
    recruzarMemoria().then(n => { if (n) onRecargar() }).catch(() => {})
  }, [datos, memoria, banco, onRecargar])
  const ultimaME = datos?.ultimaBusqueda ? new Date(datos.ultimaBusqueda).getTime() : 0
  // Buscando = se pidió y todavía no llegó una búsqueda terminada después del pedido.
  const buscandoME = pidiendoME != null && ultimaME < pidiendoME - 5000
  useEffect(() => {
    if (!buscandoME || pidiendoME == null) return
    const t = setInterval(() => {
      if (Date.now() - pidiendoME > 5 * 60_000) {
        setPidiendoME(null)
        setAvisoME('La PC de los pagos no respondió en 5 minutos: revisa que esté encendida (Pagos MercadoEnvíos, en el menú de la cuenta del administrador).')
        return
      }
      onRecargar()
    }, 10_000)
    return () => clearInterval(t)
  }, [buscandoME, pidiendoME, onRecargar])
  useEffect(() => {
    if (pidiendoME == null || buscandoME) return
    setPidiendoME(null)   // terminó (el tiempo agotado ya lo pone en null antes): ahora las ventas de ML
    actualizar()
  }, [pidiendoME, buscandoME])   // eslint-disable-line react-hooks/exhaustive-deps
  const traerME = async () => {
    setAvisoME(null)
    const r = await fetch('/api/pagos-me/traer', { method: 'POST' }).catch(() => null)
    const d = await r?.json().catch(() => null)
    if (r?.ok) { if (d?.pedido) tomada.current = Number(d.pedido); setPidiendoME(Date.now() - (d?.reusado ? 60_000 : 0)); tme.recargar() }
    else setAvisoME('No se pudo pedir la búsqueda de pagos.')
  }

  const actualizar = async () => {
    setActualizando(true); setError(null)
    try {
      const r = await fetch('/api/sales/por-confirmar', { method: 'POST' })
      const j = await r.json().catch(() => null)
      if (!r.ok || (j && !j.ok)) setError(j?.errores?.join(' · ') || j?.error || 'No se pudo traer de MercadoLibre')
      else setRevisado({ at: new Date().toISOString(), nuevas: Number(j?.nuevas) || 0 })
      await onRecargar()
    } finally { setActualizando(false) }
  }

  if (!datos) return <div className="rounded-xl border border-neutral-200 bg-white p-8 text-center text-sm text-neutral-400">Cargando…</div>

  const q = buscar.trim().toLowerCase()
  const coincide = (f: Fila) => !q || [f.numero, f.comprador, f.nick, f.cuenta, ...f.lineas.map(l => `${l.titulo} ${l.variante ?? ''}`)]
    .some(t => (t ?? '').toLowerCase().includes(q))
  // 12-11 (el dueño, caso guía subida a mano): sin inventario, la venta con la guía ya REPORTADA y sin pago en el sistema
  // ya está terminada (Calificaciones la toma como concretada): no sale como «No ha pagado» ni cae en Vencidas. Con un pago
  // por verificar sigue (falta revisar el dinero). Con inventario no se toca: falta registrarla en Ventas.
  const filas = datos.filas.map(f => (f.numero in notasML ? { ...f, nota: notasML[f.numero] } : f))
    .filter(f => !(sinInventario && f.despacho === 'reportada' && (!f.pago || f.pago.verificacion === 'invalido')))
    .filter(coincide)
  const vigentes = filas.filter(f => !f.vencida)
  const vencidas = filas.filter(f => f.vencida && !f.concretadaSinVenta)
  // 10-11: calificadas como concretadas sin venta ni pago en el sistema (solo con inventario: sin él no se registran ventas).
  const concretadasSinVenta = sinInventario ? [] : filas.filter(f => f.concretadaSinVenta)
  // 12-11 (el dueño): con inventario, «Con pago» va primero con los pagos por verificar (el más nuevo arriba) y después
  // los verificados que faltan registrar, el más viejo arriba para que no se olviden.
  const t = (f: Fila) => new Date(f.fecha).getTime()
  const conPagoTodos = vigentes.filter(f => f.pago && f.pago.verificacion !== 'invalido')
  const conPago = [
    ...conPagoTodos.filter(f => f.pago!.verificacion !== 'valido').sort((x, y) => t(y) - t(x)),
    ...conPagoTodos.filter(f => f.pago!.verificacion === 'valido').sort((x, y) => t(x) - t(y)),
  ]
  const sinPago = vigentes.filter(f => !conPago.includes(f))
  // Sin inventario: por verificar · listos para despachar (verificados en los últimos 3 días) · sin pago.
  const porVerificar = conPago.filter(f => f.pago!.verificacion === 'pendiente')
  // Ya cargadas con pago por verificar (22-10): también entran en la búsqueda.
  const cargadas = (datos.cargadas ?? []).filter(c => !q || [c.numero, c.cliente, ...c.productos.map(p => p.nombre)].some(t => (t ?? '').toLowerCase().includes(q)))
  // Con la guía ya impresa (o reportada) ya está despachada: sale de "Listos para despachar" (26-10).
  const listos = conPago.filter(f => f.pago!.verificacion === 'valido' && f.despacho !== 'impresa' && f.despacho !== 'reportada'
    && (!f.pago!.verificadoAt || Date.now() - new Date(f.pago!.verificadoAt).getTime() < 3 * 86_400_000))

  return (
    <Recargar.Provider value={onRecargar}>
    <div className="space-y-3">
      {datos.pagosME && !enPagosME && <EstadoPagosME vuelta={tme.traida ? `${tme.traida.id}-${tme.ocupada}` : ''} />}
      <div className="flex flex-col gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Una línea por botón: qué trae y cuándo fue la última vez. */}
        <div className="space-y-0.5 text-xs text-neutral-500">
          {/* Pagos ME sin inventario (24-10, pedido del dueño): UN mensaje sencillo, con el nombre del botón de arriba. */}
          {sinInventario ? (
            <p>
              <b className="text-neutral-700">«Traer pagos y guías»</b> trae tus pagos, guías y ventas nuevas (tarda 1 a 3 min) · {buscandoME
                ? <b className="text-violet-700">trayendo…</b>
                : <>última vez <b className="text-neutral-700">{datos.ultimaBusqueda ? hora(datos.ultimaBusqueda) : '—'}</b></>}
            </p>
          ) : <>
          {/* 17-11 (el dueño): un solo botón, como en Pagos ME: las ventas al instante y los pagos/guías cuando llegan.
              18-11: lo que hace cada botón va en la ⓘ del título de Ventas. */}
          <p>
            Ventas: {revisado
              ? <>recién {hora(revisado.at)}, <b className={revisado.nuevas ? 'text-emerald-700' : 'text-neutral-700'}>
                  {revisado.nuevas ? `${revisado.nuevas} ${revisado.nuevas === 1 ? 'nueva' : 'nuevas'}` : 'nada nuevo'}</b></>
              : <>última <b className="text-neutral-700">{datos.sincronizadas_at ? hora(datos.sincronizadas_at) : '—'}</b></>}
            {datos.pagosME && <> · Pagos: {buscandoME
              ? <b className="text-violet-700">trayendo…</b>
              : <>última <b className="text-neutral-700">{datos.ultimaBusqueda ? hora(datos.ultimaBusqueda) : '—'}</b></>}</>}
          </p>
          </>}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <IrADespachos />
          {datos.pagosME && (
            <button type="button" onClick={() => setBanco(true)} title="Sube los estados de cuenta y el sistema dice qué pagos llegaron de verdad"
              className="inline-flex items-center gap-1.5 rounded-lg border border-sky-300 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-900 shadow-sm hover:border-sky-400 hover:bg-sky-100">
              🏦 Comprobar con el banco
            </button>
          )}
          {!sinInventario && (() => {
            const ocupado = actualizando || (datos.pagosME && (buscandoME || tme.ocupada))
            return (
              <button type="button" disabled={ocupado}
                onClick={() => { actualizar(); if (datos.pagosME) traerME() }}
                title={datos.pagosME ? 'Trae las ventas nuevas de MercadoLibre y los pagos y guías de MercadoEnvíos (lo hace la PC de los pagos)' : 'Trae de MercadoLibre las ventas nuevas'}
                className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-neutral-100 px-3 py-1.5 text-xs font-semibold text-neutral-800 shadow-sm hover:border-neutral-400 hover:bg-neutral-200 disabled:cursor-wait disabled:text-neutral-400">
                <IconoActualizar girando={ocupado} />
                {actualizando ? 'Trayendo ventas…' : ocupado ? 'Trayendo pagos…' : datos.pagosME ? 'Traer pagos y ventas' : 'Traer ventas'}
              </button>
            )
          })()}
        </div>
      </div>
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{error}</div>}
      {datos.pagosME && memoria.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
          <span>🏦 En memoria: estado de cuenta de <b>{[...new Set(memoria.map(m => m.estado.banco))].join(', ')}</b>
            {' '}(subido {new Date(memoria.map(m => m.at).sort().at(-1)!).toLocaleTimeString('es-VE', { hour: 'numeric', minute: '2-digit' })}).</span>
          <button type="button" onClick={() => { borrarMemoria(); cruzados.current.clear() }}
            className="ml-auto font-medium text-sky-800 underline hover:text-sky-950">Quitar</button>
        </div>
      )}
      {banco && createPortal(
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 sm:items-center sm:p-4" role="dialog" aria-modal="true">
          <div className="flex max-h-[95vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl bg-neutral-50 shadow-2xl sm:rounded-2xl">
            <div className="flex items-center justify-between border-b bg-white px-5 py-3">
              <h3 className="font-semibold">🏦 Comprobar con el banco</h3>
              <button onClick={() => { setBanco(false); onRecargar() }} className="btn-ghost !px-2 !py-1" aria-label="Cerrar">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4"><ComprobarBanco onAprobados={() => { onRecargar() }} /></div>
            <div className="flex justify-end border-t bg-white px-5 py-3">
              <button onClick={() => { setBanco(false); onRecargar() }} className="btn-primary text-sm">Listo, cerrar</button>
            </div>
          </div>
        </div>, document.body)}
      {sinInv && <QuitarSinInventario filas={datos.filas} onCerrar={() => setSinInv(false)} />}
      {avisoME && <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">{avisoME}</div>}
      {datos.filas.length > 0 && (
        <div className="flex items-center gap-2">
          <input type="search" value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar por nombre, apodo, número de venta o producto…"
            className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm sm:max-w-md" />
          {q && <span className="shrink-0 text-xs text-neutral-500">{filas.length} de {datos.filas.length}</span>}
          {!sinInventario && datos.conInventario && (
            <button type="button" onClick={() => setSinInv(true)} title="Quitar de pendientes las ventas que no vas a registrar"
              className="shrink-0 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs font-semibold text-neutral-700 shadow-sm hover:border-neutral-400 hover:bg-neutral-50">
              Sin inventario
            </button>
          )}
        </div>
      )}

      {!sinInventario && onVerificarCargada && cargadas.length > 0 && (
        <section className="overflow-hidden rounded-xl border border-amber-200 bg-white shadow-sm">
          <div className="flex items-baseline gap-2 border-b border-amber-100 bg-amber-50/70 px-4 py-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-amber-900">Ya cargadas · pago por verificar</h3>
            <span className="text-xs font-medium text-amber-700">{cargadas.length}</span>
            <span className="hidden text-[11px] text-amber-800/70 sm:inline">· Cargadas antes de que llegara el pago: verifícalo y quedan procesadas</span>
          </div>
          <ul className="divide-y divide-neutral-100">
            {cargadas.map(c => <FilaCargada key={c.sale_id} c={c} onVerificar={onVerificarCargada} />)}
          </ul>
        </section>
      )}

      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
        {vigentes.length ? (
          sinInventario ? <>
            <Grupo titulo="Por verificar" nota="Revisa cada pago contra el banco" filas={porVerificar} d={datos} onConfirmar={onConfirmar} onVerificar={onVerificar} />
            {!porVerificar.length && (
              <div className="px-4 py-6 text-center border-b border-neutral-100">
                <p className="text-sm font-medium text-neutral-700">Nada por verificar</p>
                <p className="mt-1 text-xs text-neutral-400">Cuando un cliente pague, su venta aparece aquí después de traer los pagos.</p>
              </div>
            )}
            <Grupo titulo="Listos para despachar" nota="Pago verificado: sus guías están en Despachos" filas={listos} d={datos} onConfirmar={onConfirmar} onVerificar={onVerificar} plegable />
            <Grupo titulo="Sin pago todavía" nota="El cliente no ha pagado, o el pago no se ha traído" filas={sinPago} d={datos} onConfirmar={onConfirmar} onVerificar={onVerificar} plegable />
          </> : datos.pagosME ? <>
            <Grupo titulo="Con pago" nota="Falta descontarlas del inventario: revisa y registra cada una" filas={conPago} d={datos} onConfirmar={onConfirmar} onPago={onVerificarPago} onPagoChip={onPagoChip} />
            {!conPago.length && (
              <div className="px-4 py-6 text-center border-b border-neutral-100">
                <p className="text-sm font-medium text-neutral-700">Nada con pago por confirmar</p>
                <p className="mt-1 text-xs text-neutral-400">Cuando un cliente pague, su venta aparece aquí después de buscar los pagos.</p>
              </div>
            )}
            <Grupo titulo="Sin pago todavía" nota="El cliente no ha pagado, o el pago no se ha buscado" filas={sinPago} d={datos} onConfirmar={onConfirmar} onPago={onVerificarPago} onPagoChip={onPagoChip} plegable />
          </> : (
            <ul className="divide-y divide-neutral-100">
              {vigentes.map(f => <FilaVenta key={f.numero} f={f} d={datos} onConfirmar={onConfirmar} />)}
            </ul>
          )
        ) : (
          <div className="px-4 py-10 text-center">
            <p className="text-sm font-medium text-neutral-700">Todo al día</p>
            <p className="mt-1 text-xs text-neutral-400">No hay ventas de MercadoLibre sin registrar.</p>
          </div>
        )}
      </div>

      {vencidas.length > 0 && (
        <div className="rounded-xl border border-neutral-200 bg-neutral-50/60">
          <button type="button" onClick={() => setVerVencidas(v => !v)}
            className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left">
            <span className="text-sm font-medium text-neutral-600">
              Vencidas <span className="text-neutral-400">{vencidas.length}</span>
            </span>
            <span className="text-xs text-neutral-400">
              {/* Sin inventario no se "registra" nada: vence la que no pagó (23-10). */}
              Más de {datos.dias} días {sinInventario ? 'sin pago' : 'sin registrar'}: Calificaciones las toma como no concretadas{datos.pagosME ? ' (si no buscaste los pagos después, quedan para Revisar)' : ''} · {verVencidas ? 'Ocultar' : 'Ver'}
            </span>
          </button>
          {verVencidas && (
            <ul className="divide-y divide-neutral-100 border-t border-neutral-200 bg-white">
              {vencidas.map(f => <FilaVenta key={f.numero} f={f} d={datos} onConfirmar={onConfirmar} onVerificar={onVerificar} onPago={onVerificarPago} onPagoChip={onPagoChip} />)}
            </ul>
          )}
        </div>
      )}
      {concretadasSinVenta.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/60">
          <div className="px-4 py-2.5">
            <p className="text-sm font-medium text-amber-900">Calificadas como concretadas sin venta registrada <span className="text-amber-700">{concretadasSinVenta.length}</span></p>
            <p className="text-xs text-amber-800">En MercadoLibre quedaron concretadas, pero aquí no hay venta registrada ni pago. Si se vendió, regístrala para descontar el inventario; si ya la registraron como venta LOCAL, tócale «La registré como venta local» y enlázala. Para las próximas: regístralas desde aquí (con el número de MercadoLibre), no como LOCAL.</p>
          </div>
          <ul className="divide-y divide-amber-100 border-t border-amber-200 bg-white">
            {concretadasSinVenta.map(f => (
              <div key={f.numero}>
                <FilaVenta f={f} d={datos} onConfirmar={onConfirmar} onVerificar={onVerificar} onPago={onVerificarPago} onPagoChip={onPagoChip} />
                {/* 11-11: cobro destino registrado como LOCAL-…: se enlaza y sale del aviso (mig 165). */}
                <div className="px-4 pb-2.5 -mt-1"><EnlazarLocal numero={f.numero} onHecho={onRecargar} /></div>
              </div>
            ))}
          </ul>
        </div>
      )}
      <ListaNoConcretadas filas={datos.noConcretadas ?? []} />
      <ListaFuera filas={datos.despachadasFuera ?? []} />
      <ListaQuitadas filas={datos.sinInventario ?? []} />
    </div>
    </Recargar.Provider>
  )
}

/** Las que hay que trabajar: con pago (0 = al día). Sin Pagos ME, todas las vigentes. */
export function pendientesPorConfirmar(datos: Datos | null) {
  // + las ya cargadas cuyo pago trajo Pagos ME (22-10): también hay que trabajarlas.
  return (datos?.filas.filter(f => !f.vencida && (!datos.pagosME || (!!f.pago && f.pago.verificacion !== 'invalido'))).length ?? 0)
    + (datos?.cargadas?.length ?? 0)
}

/** Número dentro del botón "Por confirmar" (botón blanco): naranja si hay ventas por confirmar. */
export function NumeroBoton({ n, cargando = false }: { n: number; cargando?: boolean }) {
  return (
    <span className={`ml-1.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-xs font-semibold num ${
      n > 0 ? 'bg-orange-500 text-white' : 'bg-neutral-100 text-neutral-400'}`}>
      {cargando ? '·' : n}
    </span>
  )
}

/** Carga de la lista (la usan VentasClient y el Inicio para el conteo y la vista). */
export function usePorConfirmar(activo: boolean) {
  const [datos, setDatos] = useState<Datos | null>(null)
  const cargar = useCallback(async () => {
    if (!activo) return
    const r = await fetch('/api/sales/por-confirmar', { cache: 'no-store' }).catch(() => null)
    if (r?.ok) setDatos(await r.json())
  }, [activo])
  useEffect(() => { cargar() }, [cargar])
  return { datos, cargar }
}

/** 18-11 (el dueño): salto directo de Por confirmar (y Pagos ME) a Despachos, su paso siguiente, sin pasar por el menú.
 *  Solo si la empresa tiene Despachos y el usuario lo ve. El numerito es el mismo del menú. */
function IrADespachos() {
  const u = useSession().data?.user as { role?: 'admin' | 'user'; permisos?: string[]; modulos?: string[]; country?: string } | undefined
  if (!u || u.country !== 'VE' || !rutaHabilitada('/despachos', u.modulos ?? []) || !rutaPermitida('/despachos', u)) return null
  return (
    <Link href="/despachos" title="Imprimir las guías de lo que ya confirmaste"
      className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-800 shadow-sm hover:border-neutral-400 hover:bg-neutral-50">
      Ir a Despachos<NumeritoAviso clave="despachos" urgente={false} /> →
    </Link>
  )
}

/** 18-11 (el dueño: «en Por confirmar no tenemos datos del vigilante»): la misma línea de estado de Pagos ME (PC, cuentas,
 *  última traída, avisos) con ⚙ Conexión a su página. Solo con el permiso de ver Pagos ME. Se relee al terminar cada traída. */
function EstadoPagosME({ vuelta }: { vuelta: string }) {
  const u = useSession().data?.user as { role?: 'admin' | 'user'; permisos?: string[] } | undefined
  const ve = !!u && puede(u, 'ver_pagos_me')
  const [d, setD] = useState<(DatosVigilante & { desdeML?: boolean }) | null>(null)
  const [otra, setOtra] = useState(0)
  useEffect(() => {
    if (!ve) return
    let vivo = true
    fetch('/api/pagos-me?solo=estado', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null))
      .then(x => { if (vivo && x?.vigilante) setD(x) }).catch(() => {})
    return () => { vivo = false }
  }, [ve, vuelta, otra])
  if (!ve || !d) return null
  // ⚙ Conexión se despliega aquí mismo (18-11, el dueño: antes llevaba a otra página y sacaba de Por confirmar).
  return <VigilanteConConexion d={d} isAdmin={puede(u, 'pagos_me_config')} desdeML={!!d.desdeML} onCambio={() => setOtra(n => n + 1)} />
}
