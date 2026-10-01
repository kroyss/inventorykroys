'use client'
import { useEffect, useMemo, useState } from 'react'
import { Cargando, EmptyState, FilterPills } from '@/components/ui'

interface Envio {
  id: number; venta: string; guia: string; carrier: string; destinatario: string | null; cuenta: string | null
  reimpresion: boolean; reporte_estado: string | null; reporte_detalle: string | null
  reporte_intentos: number; reportado_at: string | null; reporte_mensaje: string | null
  jornada_id: number; closed_at: string
}
interface Jornada { id: number; closed_at: string; total_envios: number }
type FiltroEstado = 'todos' | 'enviados' | 'problema' | 'pendientes'

const ESTADO_UI: Record<string, { label: string; cls: string }> = {
  ENVIADO:   { label: 'Enviado',              cls: 'bg-green-100 text-green-800' },
  SIN_CHAT:  { label: 'Sin chat',             cls: 'bg-neutral-200 text-neutral-700' },
  RECHAZADO: { label: 'Rechazado por ML',     cls: 'bg-red-100 text-red-800' },
  ERROR:     { label: 'Error (se reintenta)', cls: 'bg-amber-100 text-amber-800' },
  CSV:       { label: 'Por CSV (viejo)',      cls: 'bg-neutral-100 text-neutral-600' },
}
const REIMPRESION = { label: 'Reimpresión (ya reportado)', cls: 'bg-neutral-100 text-neutral-600' }
const PENDIENTE = { label: 'Pendiente', cls: 'bg-sky-100 text-sky-800' }

const fechaHora = (s: string) => new Date(s).toLocaleString('es-VE', {
  timeZone: 'America/Caracas', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
})

function grupo(e: Envio): FiltroEstado | null {
  if (e.reimpresion) return null
  if (!e.reporte_estado) return 'pendientes'
  if (e.reporte_estado === 'ENVIADO' || e.reporte_estado === 'CSV') return 'enviados'
  return 'problema'
}

/** Reportador → Historial: a quién se le reportó la guía, cuándo, por dónde y con qué texto. */
export default function ReportadorHistorial({ jornadaInicial }: { jornadaInicial: number | null }) {
  const [periodo, setPeriodo] = useState(jornadaInicial ? `j${jornadaInicial}` : 'd7')
  const [datos, setDatos] = useState<{ envios: Envio[]; jornadas: Jornada[] } | null>(null)
  const [estado, setEstado] = useState<FiltroEstado>('todos')
  const [cuenta, setCuenta] = useState('todas')
  const [q, setQ] = useState('')
  const [abierto, setAbierto] = useState<number | null>(null)

  useEffect(() => {
    let vivo = true
    const qs = periodo.startsWith('j') ? `jornada=${periodo.slice(1)}` : `dias=${periodo.slice(1)}`
    fetch(`/api/despachos/reportador/historial?${qs}`).then(r => r.ok ? r.json() : null).then(d => { if (vivo && d) setDatos(d) })
    return () => { vivo = false }
  }, [periodo])

  const envios = useMemo(() => datos?.envios ?? [], [datos])
  const cuentas = useMemo(() => [...new Set(envios.map(e => e.cuenta ?? '—'))].sort(), [envios])
  const filtro = q.trim().toLowerCase()
  const base = envios.filter(e => (cuenta === 'todas' || (e.cuenta ?? '—') === cuenta)
    && (!filtro || `${e.venta} ${e.guia} ${e.destinatario ?? ''}`.toLowerCase().includes(filtro)))
  const n = (g: FiltroEstado) => base.filter(e => grupo(e) === g).length
  const filas = estado === 'todos' ? base : base.filter(e => grupo(e) === estado)

  if (!datos) return <Cargando />
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select value={periodo} onChange={e => setPeriodo(e.target.value)}
          className="border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white">
          <option value="d7">Últimos 7 días</option>
          <option value="d30">Últimos 30 días</option>
          <option value="d90">Últimos 90 días</option>
          <optgroup label="Una jornada">
            {datos.jornadas.map(j => (
              <option key={j.id} value={`j${j.id}`}>Cierre {fechaHora(j.closed_at)} · {j.total_envios ?? 0} envíos</option>
            ))}
          </optgroup>
        </select>
        <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar venta, guía o comprador…"
          className="border border-neutral-300 rounded-lg px-3 py-2 text-sm flex-1 min-w-48 md:max-w-80" />
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <FilterPills value={estado} onChange={setEstado} options={[
          { value: 'todos', label: 'Todos', count: base.filter(e => !e.reimpresion).length },
          { value: 'enviados', label: 'Enviados', count: n('enviados') },
          { value: 'problema', label: 'Con problema', count: n('problema') },
          { value: 'pendientes', label: 'Pendientes', count: n('pendientes') },
        ]} />
        {cuentas.length > 1 && (
          <FilterPills value={cuenta} onChange={setCuenta}
            options={[{ value: 'todas', label: 'Todas las cuentas' }, ...cuentas.map(c => ({ value: c, label: c }))]} />
        )}
      </div>

      {filas.length === 0 ? (
        <div className="bg-white rounded-xl border border-neutral-200 shadow-sm">
          <EmptyState message="No hay reportes con estos filtros." />
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-x-auto">
          <table className="w-full text-sm [&_th]:whitespace-nowrap">
            <thead className="bg-neutral-50 text-xs text-neutral-500">
              <tr className="border-b border-neutral-100">
                <th className="px-3 py-2 text-left">Fecha</th>
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
                const ver = abierto === e.id
                return (
                  <tr key={e.id} className="border-b border-neutral-50 align-top">
                    <td className="px-3 py-2 text-xs text-neutral-600 whitespace-nowrap">
                      {e.reportado_at ? fechaHora(e.reportado_at) : <span className="text-neutral-400">cierre {fechaHora(e.closed_at)}</span>}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{e.venta}</td>
                    <td className="px-3 py-2 text-xs">{e.destinatario ?? '—'}</td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap"><span className="text-neutral-400">{e.carrier}</span> <span className="font-mono">{e.guia}</span></td>
                    <td className="px-3 py-2 text-xs text-neutral-600">{e.cuenta ?? '—'}</td>
                    <td className="px-3 py-2"><span className={`inline-block px-2 py-0.5 rounded-full text-xs whitespace-nowrap ${ui.cls}`}>{ui.label}</span></td>
                    <td className="px-3 py-2 text-xs text-neutral-500 min-w-56">
                      {e.reporte_estado && <span className="text-neutral-400">{api ? 'por API' : 'programa'}{detalle ? ' · ' : ''}</span>}
                      {detalle}
                      {e.reporte_intentos > 1 ? ` · ${e.reporte_intentos} intentos` : ''}
                      {e.reporte_mensaje && (
                        <button onClick={() => setAbierto(ver ? null : e.id)} className="ml-2 underline underline-offset-2 hover:text-neutral-800">
                          {ver ? 'ocultar mensaje' : 'ver mensaje'}
                        </button>
                      )}
                      {ver && <p className="mt-1 text-neutral-700 whitespace-pre-line bg-neutral-50 border border-neutral-100 rounded px-2 py-1">{e.reporte_mensaje}</p>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-neutral-400">
        El texto enviado se guarda desde el 1/10 (Reportador por API). Los reportes anteriores o del programa de escritorio se ven en la conversación de la venta en MercadoLibre.
      </p>
    </div>
  )
}
