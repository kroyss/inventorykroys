'use client'
import { useEffect, useMemo, useState } from 'react'
import { Cargando, EmptyState, FilterPills } from '@/components/ui'

interface Envio {
  id: number; venta: string; guia: string; carrier: string; destinatario: string | null; cuenta: string | null
  reimpresion: boolean; reporte_estado: string | null; reporte_detalle: string | null
  reporte_intentos: number; reportado_at: string | null; reporte_mensaje: string | null
  jornada_id: number; closed_at: string
}
type FiltroEstado = 'todos' | 'enviados' | 'problema' | 'pendientes'
interface Dia { jornada: number; closed_at: string; envios: Envio[] }

const ESTADO_UI: Record<string, { label: string; cls: string }> = {
  ENVIADO:   { label: 'Enviado',              cls: 'bg-green-100 text-green-800' },
  SIN_CHAT:  { label: 'Sin chat',             cls: 'bg-neutral-200 text-neutral-700' },
  RECHAZADO: { label: 'Rechazado por ML',     cls: 'bg-red-100 text-red-800' },
  ERROR:     { label: 'Error (se reintenta)', cls: 'bg-amber-100 text-amber-800' },
  CSV:       { label: 'Por CSV (viejo)',      cls: 'bg-neutral-100 text-neutral-600' },
}
const REIMPRESION = { label: 'Reimpresión (ya reportado)', cls: 'bg-neutral-100 text-neutral-600' }
const PENDIENTE = { label: 'Pendiente', cls: 'bg-sky-100 text-sky-800' }

const TZ = 'America/Caracas'
const fechaHora = (s: string) => new Date(s).toLocaleString('es-VE', { timeZone: TZ, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
const hora = (s: string) => new Date(s).toLocaleTimeString('es-VE', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })
const dia = (s: string) => new Date(s).toLocaleDateString('es-VE', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' })

function grupo(e: Envio): FiltroEstado | null {
  if (e.reimpresion) return null
  if (!e.reporte_estado) return 'pendientes'
  if (e.reporte_estado === 'ENVIADO' || e.reporte_estado === 'CSV') return 'enviados'
  return 'problema'
}

/** Reportador → Historial: un renglón por jornada (día de despacho) con el resumen; al abrirlo,
 *  a quién se le reportó la guía, cuándo, por dónde y con qué texto. */
export default function ReportadorHistorial({ jornadaInicial }: { jornadaInicial: number | null }) {
  const [periodo, setPeriodo] = useState(jornadaInicial ? `j${jornadaInicial}` : 'd30')
  const [envios, setEnvios] = useState<Envio[] | null>(null)
  const [q, setQ] = useState('')
  const [abiertos, setAbiertos] = useState<Set<number>>(() => new Set(jornadaInicial ? [jornadaInicial] : []))

  useEffect(() => {
    let vivo = true
    const qs = periodo.startsWith('j') ? `jornada=${periodo.slice(1)}` : `dias=${periodo.slice(1)}`
    fetch(`/api/despachos/reportador/historial?${qs}`).then(r => r.ok ? r.json() : null)
      .then(d => { if (vivo && d) setEnvios(d.envios) })
    return () => { vivo = false }
  }, [periodo])

  const filtro = q.trim().toLowerCase()
  const dias = useMemo(() => {
    const m = new Map<number, Dia>()
    for (const e of envios ?? []) {
      if (filtro && !`${e.venta} ${e.guia} ${e.destinatario ?? ''}`.toLowerCase().includes(filtro)) continue
      const d = m.get(e.jornada_id) ?? { jornada: e.jornada_id, closed_at: e.closed_at, envios: [] }
      d.envios.push(e)
      m.set(e.jornada_id, d)
    }
    return [...m.values()]
  }, [envios, filtro])

  const alternar = (id: number) => setAbiertos(s => {
    const n = new Set(s)
    if (n.has(id)) n.delete(id); else n.add(id)
    return n
  })

  if (!envios) return <Cargando />
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select value={periodo} onChange={e => setPeriodo(e.target.value)}
          className="border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white">
          {jornadaInicial && <option value={`j${jornadaInicial}`}>Solo la jornada elegida</option>}
          <option value="d7">Últimos 7 días</option>
          <option value="d30">Últimos 30 días</option>
          <option value="d90">Últimos 90 días</option>
        </select>
        <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar venta, guía o comprador…"
          className="border border-neutral-300 rounded-lg px-3 py-2 text-sm flex-1 min-w-48 md:max-w-80" />
      </div>

      {dias.length === 0 ? (
        <div className="bg-white rounded-xl border border-neutral-200 shadow-sm">
          <EmptyState message={filtro ? 'Ningún envío coincide con la búsqueda.' : 'No hay jornadas cerradas en este período.'} />
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-neutral-200 shadow-sm divide-y divide-neutral-100">
          {dias.map(d => (
            <FilaDia key={d.jornada} d={d} abierto={abiertos.has(d.jornada) || !!filtro} onToggle={() => alternar(d.jornada)} />
          ))}
        </div>
      )}
      <p className="text-xs text-neutral-400">
        El texto enviado se guarda desde el 1/10 (Reportador por API). Los reportes anteriores o del programa de escritorio se ven en la conversación de la venta en MercadoLibre.
      </p>
    </div>
  )
}

function FilaDia({ d, abierto, onToggle }: { d: Dia; abierto: boolean; onToggle: () => void }) {
  const [estado, setEstado] = useState<FiltroEstado>('todos')
  const [cuenta, setCuenta] = useState('todas')
  const [verMsg, setVerMsg] = useState<number | null>(null)

  const n = (g: FiltroEstado) => d.envios.filter(e => grupo(e) === g).length
  const reportables = d.envios.filter(e => !e.reimpresion)
  const porCuenta = Object.entries(reportables.reduce<Record<string, number>>((a, e) => {
    const c = e.cuenta ?? '—'; a[c] = (a[c] ?? 0) + 1; return a
  }, {})).sort((a, b) => b[1] - a[1])
  const ultimo = d.envios.map(e => e.reportado_at).filter((x): x is string => !!x).sort().pop()
  const porApi = d.envios.some(e => e.reporte_estado && e.reporte_detalle?.startsWith('API'))
  const porPrograma = d.envios.some(e => e.reporte_estado && !e.reporte_detalle?.startsWith('API'))

  const filas = d.envios.filter(e => (estado === 'todos' || grupo(e) === estado) && (cuenta === 'todas' || (e.cuenta ?? '—') === cuenta))

  return (
    <div>
      <button onClick={onToggle} className="w-full text-left px-4 py-3 hover:bg-neutral-50/70 flex flex-wrap items-center gap-x-6 gap-y-1">
        <span className={`text-neutral-400 transition-transform ${abierto ? 'rotate-90' : ''}`}>›</span>
        <div className="min-w-32">
          <div className="font-semibold text-neutral-900 capitalize">{dia(d.closed_at)}</div>
          <div className="text-xs text-neutral-400">cierre {hora(d.closed_at)}</div>
        </div>
        <div className="text-sm text-neutral-600 min-w-20"><b className="text-neutral-900 num">{reportables.length}</b> envíos</div>
        <div className="flex flex-wrap gap-x-3 text-xs">
          {n('enviados') > 0 && <span className="text-green-700 font-medium">✓ {n('enviados')} enviado(s)</span>}
          {n('problema') > 0 && <span className="text-red-700 font-medium">⚠ {n('problema')} con problema</span>}
          {n('pendientes') > 0 && <span className="text-sky-700 font-medium">{n('pendientes')} pendiente(s)</span>}
        </div>
        <div className="text-xs text-neutral-500">{porCuenta.map(([c, k]) => `${c} ${k}`).join(' · ')}</div>
        <div className="text-xs text-neutral-400 md:ml-auto">
          {ultimo ? `reportado ${fechaHora(ultimo)}` : 'sin reportar'}
          {porApi && porPrograma ? ' · API y programa' : porApi ? ' · por API' : porPrograma ? ' · programa' : ''}
        </div>
      </button>

      {abierto && (
        <div className="px-4 pb-4 space-y-2">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <FilterPills value={estado} onChange={setEstado} options={[
              { value: 'todos', label: 'Todos', count: reportables.length },
              { value: 'enviados', label: 'Enviados', count: n('enviados') },
              { value: 'problema', label: 'Con problema', count: n('problema') },
              { value: 'pendientes', label: 'Pendientes', count: n('pendientes') },
            ]} />
            {porCuenta.length > 1 && (
              <FilterPills value={cuenta} onChange={setCuenta}
                options={[{ value: 'todas', label: 'Todas las cuentas' }, ...porCuenta.map(([c]) => ({ value: c, label: c }))]} />
            )}
          </div>
          <div className="border border-neutral-100 rounded-lg overflow-x-auto">
            <table className="w-full text-sm [&_th]:whitespace-nowrap">
              <thead className="bg-neutral-50 text-xs text-neutral-500">
                <tr>
                  <th className="px-3 py-2 text-left">Venta</th>
                  <th className="px-3 py-2 text-left">Comprador</th>
                  <th className="px-3 py-2 text-left">Guía</th>
                  <th className="px-3 py-2 text-left">Cuenta</th>
                  <th className="px-3 py-2 text-left">Reporte</th>
                  <th className="px-3 py-2 text-left">Detalle</th>
                </tr>
              </thead>
              <tbody>
                {filas.map(e => {
                  const ui = e.reimpresion ? REIMPRESION : ESTADO_UI[e.reporte_estado ?? ''] ?? PENDIENTE
                  const api = e.reporte_detalle?.startsWith('API')
                  const detalle = e.reporte_detalle?.replace(/^API:?\s*/, '') || null
                  const ver = verMsg === e.id
                  return (
                    <tr key={e.id} className="border-t border-neutral-50 align-top">
                      <td className="px-3 py-2 font-mono text-xs">{e.venta}</td>
                      <td className="px-3 py-2 text-xs">{e.destinatario ?? '—'}</td>
                      <td className="px-3 py-2 text-xs whitespace-nowrap"><span className="text-neutral-400">{e.carrier}</span> <span className="font-mono">{e.guia}</span></td>
                      <td className="px-3 py-2 text-xs text-neutral-600">{e.cuenta ?? '—'}</td>
                      <td className="px-3 py-2"><span className={`inline-block px-2 py-0.5 rounded-full text-xs whitespace-nowrap ${ui.cls}`}>{ui.label}</span></td>
                      <td className="px-3 py-2 text-xs text-neutral-500 min-w-56">
                        {e.reporte_estado && <span className="text-neutral-400">{api ? 'por API' : 'programa'}{e.reportado_at ? ` ${fechaHora(e.reportado_at)}` : ''}{detalle ? ' · ' : ''}</span>}
                        {detalle}
                        {e.reporte_intentos > 1 ? ` · ${e.reporte_intentos} intentos` : ''}
                        {e.reporte_mensaje && (
                          <button onClick={() => setVerMsg(ver ? null : e.id)} className="ml-2 underline underline-offset-2 hover:text-neutral-800">
                            {ver ? 'ocultar mensaje' : 'ver mensaje'}
                          </button>
                        )}
                        {ver && <p className="mt-1 text-neutral-700 whitespace-pre-line bg-neutral-50 border border-neutral-100 rounded px-2 py-1">{e.reporte_mensaje}</p>}
                      </td>
                    </tr>
                  )
                })}
                {filas.length === 0 && (
                  <tr><td colSpan={6} className="px-3 py-4 text-center text-xs text-neutral-400">Nada con este filtro.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
