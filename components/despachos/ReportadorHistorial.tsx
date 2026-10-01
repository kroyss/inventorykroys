'use client'
import { useEffect, useMemo, useState } from 'react'
import { Cargando, EmptyState, FilterPills, Tabs } from '@/components/ui'

interface Envio {
  id: number; venta: string; guia: string; carrier: string; destinatario: string | null; cuenta: string | null
  reimpresion: boolean; reporte_estado: string | null; reporte_detalle: string | null
  reporte_intentos: number; reportado_at: string | null; reporte_mensaje: string | null
  jornada_id: number; closed_at: string
}
type FiltroEstado = 'todos' | 'enviados' | 'problema' | 'pendientes'
interface Dia { jornada: number; closed_at: string; envios: Envio[] }
interface Mes { mes: string; dias: number; envios: number }

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

const nombreMes = (m: string) => {
  const [a, mm] = m.split('-').map(Number)
  const t = new Date(a, mm - 1, 15).toLocaleDateString('es-VE', { month: 'long', year: 'numeric' })
  return t[0].toUpperCase() + t.slice(1)
}

/** Reportador → Historial en carpetas: meses arriba, un renglón por día (jornada) con el
 *  resumen y, al abrirlo, a quién se le reportó la guía, cuándo, por dónde y con qué texto.
 *  El buscador busca en todos los meses. */
export default function ReportadorHistorial({ jornadaInicial }: { jornadaInicial: number | null }) {
  const [mes, setMes] = useState<string | null>(null)
  const [datos, setDatos] = useState<{ meses: Mes[]; mes: string | null; envios: Envio[] } | null>(null)
  const [q, setQ] = useState('')
  const [buscado, setBuscado] = useState('')
  const [carrier, setCarrier] = useState<'todos' | 'ZOOM' | 'TEALCA'>('todos')
  const [abiertos, setAbiertos] = useState<Set<number>>(() => new Set(jornadaInicial ? [jornadaInicial] : []))

  // Búsqueda en el servidor (todos los meses), medio segundo después de dejar de escribir.
  useEffect(() => {
    const t = setTimeout(() => setBuscado(q.trim().length >= 3 ? q.trim() : ''), 400)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => {
    let vivo = true
    const p = new URLSearchParams()
    if (buscado) p.set('q', buscado)
    else if (mes) p.set('mes', mes)
    else if (jornadaInicial) p.set('jornada', String(jornadaInicial))
    fetch(`/api/despachos/reportador/historial?${p}`).then(r => r.ok ? r.json() : null)
      .then(d => { if (vivo && d) setDatos(d) })
    return () => { vivo = false }
  }, [mes, buscado, jornadaInicial])

  const envios = useMemo(() => datos?.envios ?? [], [datos])
  const dias = useMemo(() => {
    const m = new Map<number, Dia>()
    for (const e of envios) {
      if (carrier !== 'todos' && e.carrier !== carrier) continue
      const d = m.get(e.jornada_id) ?? { jornada: e.jornada_id, closed_at: e.closed_at, envios: [] }
      d.envios.push(e)
      m.set(e.jornada_id, d)
    }
    return [...m.values()]
  }, [envios, carrier])
  const nCarrier = (c: string) => envios.filter(e => !e.reimpresion && e.carrier === c).length

  const alternar = (id: number) => setAbiertos(s => {
    const n = new Set(s)
    if (n.has(id)) n.delete(id); else n.add(id)
    return n
  })

  if (!datos) return <Cargando />
  const mesActual = buscado ? null : datos.mes
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {datos.meses.map(m => (
          <button key={m.mes} onClick={() => { setQ(''); setBuscado(''); setMes(m.mes) }}
            className={`text-left rounded-lg border px-3 py-1.5 transition-colors ${
              mesActual === m.mes ? 'bg-neutral-900 border-neutral-900 text-white' : 'bg-white border-neutral-200 hover:border-neutral-400'}`}>
            <div className="text-sm font-medium">📁 {nombreMes(m.mes)}</div>
            <div className={`text-[11px] ${mesActual === m.mes ? 'text-neutral-300' : 'text-neutral-400'}`}>{m.dias} día(s) · {m.envios} envíos</div>
          </button>
        ))}
        <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar venta, guía o comprador (todos los meses)…"
          className="border border-neutral-300 rounded-lg px-3 py-2 text-sm flex-1 min-w-56 md:max-w-96 md:ml-auto" />
      </div>
      {buscado && (
        <p className="text-xs text-neutral-500">
          Resultados de “{buscado}” en todos los meses{envios.length >= 300 ? ' (primeros 300)' : ''} ·{' '}
          <button onClick={() => setQ('')} className="underline underline-offset-2">volver al mes</button>
        </p>
      )}

      <Tabs value={carrier} onChange={setCarrier} items={[
        { value: 'todos', label: 'Todos' },
        { value: 'ZOOM', label: 'ZOOM', count: nCarrier('ZOOM') },
        { value: 'TEALCA', label: 'TEALCA', count: nCarrier('TEALCA') },
      ]} />

      {dias.length === 0 ? (
        <div className="bg-white rounded-xl border border-neutral-200 shadow-sm">
          <EmptyState message={buscado ? 'Ningún envío coincide con la búsqueda.' : 'No hay jornadas cerradas en este mes.'} />
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-neutral-200 shadow-sm divide-y divide-neutral-100">
          {dias.map(d => (
            <FilaDia key={`${d.jornada}-${carrier}`} d={d} abierto={abiertos.has(d.jornada) || !!buscado} onToggle={() => alternar(d.jornada)} />
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
