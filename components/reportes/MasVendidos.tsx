'use client'
import { useEffect, useMemo, useState } from 'react'
import { matchFuzzy } from '@/lib/search'
import { cambio } from '@/lib/resumenAtencion'

// Reportes → Resumen → Más vendidos → «Ver detalle» (14-11, el dueño): reemplaza la pestaña Top productos. Panel lateral
// con todo lo vendido en el período del Resumen: ordenar por unidades, venta o ganancia, buscar y bajar Excel, sin
// salir del Resumen. Costo, comisión y ganancia solo con el permiso de costos (lo decide el servidor).
interface Fila { id: number; code: string; nombre: string; categoria: string | null; unidades: number; antes: number; venta: number; costo?: number; comision?: number; ganancia?: number }
type Orden = 'unidades' | 'venta' | 'ganancia'

const periodo = (d: number) => d === 365 ? 'últimos 12 meses' : `últimos ${d} días`

export default function PanelMasVendidos({ dias, onCerrar }: { dias: number; onCerrar: () => void }) {
  const [d, setD] = useState<{ verCostos: boolean; moneda: string; productos: Fila[] } | null>(null)
  const [error, setError] = useState(false)
  const [orden, setOrden] = useState<Orden>('unidades')
  const [buscar, setBuscar] = useState('')

  useEffect(() => {
    let vivo = true
    fetch(`/api/reports/mas-vendidos?dias=${dias}`, { cache: 'no-store' }).then(r => r.ok ? r.json() : Promise.reject())
      .then(j => { if (vivo) setD(j) }).catch(() => { if (vivo) setError(true) })
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar() }
    window.addEventListener('keydown', k)
    return () => { vivo = false; window.removeEventListener('keydown', k) }
  }, [dias, onCerrar])

  const filas = useMemo(() => {
    if (!d) return []
    const l = buscar.trim() ? d.productos.filter(p => matchFuzzy(buscar, p.code, p.nombre, p.categoria ?? '')) : [...d.productos]
    return l.sort((a, b) => ((b[orden] ?? 0) - (a[orden] ?? 0)) || b.unidades - a.unidades)
  }, [d, orden, buscar])

  const cop = d?.moneda === 'COP'
  const dinero = (x: number) => `$${x.toLocaleString('de-DE', { minimumFractionDigits: cop ? 0 : 2, maximumFractionDigits: cop ? 0 : 2 })}`
  const tot = filas.reduce((s, p) => ({ u: s.u + p.unidades, v: s.v + p.venta, g: s.g + (p.ganancia ?? 0) }), { u: 0, v: 0, g: 0 })

  const excel = async () => {
    if (!d) return
    const XLSX = await import('xlsx')
    const enc = ['#', 'Código', 'Producto', 'Categoría', 'Unidades', 'Período anterior', 'Venta', ...(d.verCostos ? ['Costo', 'Comisión ML', 'Ganancia'] : [])]
    const aoa: (string | number)[][] = [enc, ...filas.map((p, i) => [i + 1, p.code, p.nombre, p.categoria ?? '', p.unidades, p.antes, p.venta,
      ...(d.verCostos ? [p.costo ?? 0, p.comision ?? 0, p.ganancia ?? 0] : [])]),
      [], ['', '', 'TOTAL', '', tot.u, '', Math.round(tot.v * 100) / 100, ...(d.verCostos ? ['', '', Math.round(tot.g * 100) / 100] : [])]]
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    ws['!cols'] = [{ wch: 4 }, { wch: 10 }, { wch: 44 }, { wch: 14 }, { wch: 9 }, { wch: 10 }, { wch: 11 }, { wch: 11 }, { wch: 11 }, { wch: 11 }]
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Más vendidos')
    XLSX.writeFile(wb, `mas_vendidos_${dias}d_${new Date().toLocaleDateString('en-CA', { timeZone: 'America/Caracas' })}.xlsx`)
  }

  const ORDENES: [Orden, string][] = [['unidades', 'Unidades'], ['venta', 'Venta'], ...(d?.verCostos ? [['ganancia', 'Ganancia'] as [Orden, string]] : [])]
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Más vendidos">
      <div className="absolute inset-0 bg-black/20" onClick={onCerrar} />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl">
        <div className="space-y-3 border-b px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-neutral-900">Más vendidos</h2>
              <p className="text-sm text-neutral-500">{periodo(dias)} · comparado con el período anterior</p>
            </div>
            <button onClick={onCerrar} aria-label="Cerrar" className="text-xl leading-none text-neutral-400 hover:text-neutral-700">✕</button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div role="tablist" aria-label="Ordenar por" className="inline-flex rounded-lg bg-neutral-100 p-0.5">
              {ORDENES.map(([k, t]) => (
                <button key={k} role="tab" aria-selected={orden === k} onClick={() => setOrden(k)}
                  className={`rounded-md px-3 py-1 text-sm transition-colors ${orden === k ? 'bg-white font-medium text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-800'}`}>{t}</button>
              ))}
            </div>
            <input type="search" value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar producto…"
              className="min-w-0 flex-1 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-800" />
            <button onClick={excel} disabled={!filas.length} className="btn-secondary text-sm">Excel</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {error ? <p className="px-5 py-10 text-center text-sm text-neutral-500">No se pudo cargar. Cierra y prueba de nuevo.</p>
            : !d ? <div className="space-y-2 p-5">{[0, 1, 2, 3, 4, 5].map(i => <div key={i} className="h-10 animate-pulse rounded-lg bg-neutral-100" />)}</div>
            : !filas.length ? <p className="px-5 py-10 text-center text-sm text-neutral-400">{buscar ? 'Ningún producto coincide.' : 'Sin ventas en el período.'}</p>
            : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-white text-left text-xs text-neutral-500 shadow-[0_1px_0_#f0f0f0]">
                  <tr>
                    <th className="w-10 py-2 pl-5 font-medium">#</th>
                    <th className="py-2 pr-3 font-medium">Producto</th>
                    <th className="px-3 py-2 text-right font-medium">Unidades</th>
                    <th className="hidden px-3 py-2 text-right font-medium sm:table-cell">Venta</th>
                    {d.verCostos && <th className="py-2 pl-3 pr-5 text-right font-medium">Ganancia</th>}
                  </tr>
                </thead>
                <tbody>
                  {filas.map((p, i) => {
                    const c = cambio(p.unidades, p.antes)
                    return (
                      <tr key={p.id} className="border-t border-neutral-100 hover:bg-neutral-50">
                        <td className="py-2.5 pl-5 text-xs tabular-nums text-neutral-400">{i + 1}</td>
                        <td className="max-w-0 py-2.5 pr-3">
                          <p className="truncate font-medium text-neutral-900" title={p.nombre}>{p.nombre}</p>
                          <p className="truncate text-xs text-neutral-400"><span className="font-mono">{p.code}</span>{p.categoria ? ` · ${p.categoria}` : ''}
                            <span className="sm:hidden"> · {dinero(p.venta)}</span></p>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <span className="font-semibold tabular-nums text-neutral-900">{p.unidades.toLocaleString('es-VE')}</span>
                          <span className={`block text-[11px] tabular-nums ${c == null || c === 0 ? 'text-neutral-400' : c > 0 ? 'text-emerald-600' : 'text-red-600'}`}
                            title={`Período anterior: ${p.antes} u`}>
                            {p.antes === 0 ? 'nuevo' : c === 0 ? `= ${p.antes}` : `${c! > 0 ? '▲' : '▼'} ${Math.abs(c!)}%`}
                          </span>
                        </td>
                        <td className="hidden px-3 py-2.5 text-right tabular-nums text-neutral-700 sm:table-cell">{dinero(p.venta)}</td>
                        {d.verCostos && (
                          <td className="py-2.5 pl-3 pr-5 text-right tabular-nums" title={`Costo ${dinero(p.costo ?? 0)} · comisión ML ${dinero(p.comision ?? 0)}`}>
                            <span className={(p.ganancia ?? 0) < 0 ? 'text-red-600' : 'text-neutral-900'}>{dinero(p.ganancia ?? 0)}</span>
                            {p.venta > 0 && <span className="block text-[11px] text-neutral-400">{Math.round((p.ganancia ?? 0) / p.venta * 100)}% de la venta</span>}
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
        </div>

        {d && filas.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-neutral-50 px-5 py-3 text-sm">
            <span className="text-neutral-500">{filas.length} producto{filas.length === 1 ? '' : 's'}</span>
            <span className="flex flex-wrap gap-x-4 tabular-nums">
              <span><b>{tot.u.toLocaleString('es-VE')}</b> u</span>
              <span>Venta <b>{dinero(tot.v)}</b></span>
              {d.verCostos && <span>Ganancia <b>{dinero(tot.g)}</b></span>}
            </span>
          </div>
        )}
      </aside>
    </div>
  )
}
