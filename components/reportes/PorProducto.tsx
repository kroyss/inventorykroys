'use client'
import { useEffect, useMemo, useState } from 'react'
import { matchFuzzy } from '@/lib/search'
import { cambio } from '@/lib/resumenAtencion'
import { textoRango } from '@/lib/rangoInicio'

// Reportes → Ventas → «Por producto» (14-11, el dueño: un top de verdad, en un solo lugar). Todo lo vendido en las
// fechas elegidas arriba, contra los mismos días justo antes: podio con los 3 primeros, el resto con barra, ordenar
// por unidades, venta o ganancia, buscar y Excel. Costo, comisión y ganancia solo con el permiso de costos.
interface Fila { id: number; code: string; nombre: string; categoria: string | null; unidades: number; antes: number; venta: number; costo?: number; comision?: number; ganancia?: number }
interface Datos { desde: string; hasta: string; antesDesde: string; antesHasta: string; verCostos: boolean; moneda: string; productos: Fila[] }
type Orden = 'unidades' | 'venta' | 'ganancia'

function Variacion({ ahora, antes }: { ahora: number; antes: number }) {
  if (!antes) return <span className="text-neutral-400">nuevo</span>
  const c = cambio(ahora, antes)!
  if (c === 0) return <span className="text-neutral-400">= {antes}</span>
  return <span className={c > 0 ? 'text-emerald-600' : 'text-red-600'} title={`Antes: ${antes} u`}>{c > 0 ? '▲' : '▼'} {Math.abs(c)}%</span>
}

export default function PorProducto({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const [d, setD] = useState<Datos | null>(null)
  const [error, setError] = useState(false)
  const [orden, setOrden] = useState<Orden>('unidades')
  const [buscar, setBuscar] = useState('')

  useEffect(() => {
    let vivo = true
    fetch(`/api/reports/mas-vendidos?date_from=${dateFrom}&date_to=${dateTo}`, { cache: 'no-store' }).then(r => r.ok ? r.json() : Promise.reject())
      .then(j => { if (vivo) setD(j) }).catch(() => { if (vivo) setError(true) })
    return () => { vivo = false }
  }, [dateFrom, dateTo])

  const ordenadas = useMemo(() => !d ? [] : [...d.productos].sort((a, b) => ((b[orden] ?? 0) - (a[orden] ?? 0)) || b.unidades - a.unidades), [d, orden])
  const filas = useMemo(() => buscar.trim() ? ordenadas.filter(p => matchFuzzy(buscar, p.code, p.nombre, p.categoria ?? '')) : ordenadas, [ordenadas, buscar])

  if (error) return <p className="rounded-xl border border-neutral-200 bg-white px-4 py-8 text-center text-sm text-neutral-500">No se pudo cargar. Prueba de nuevo.</p>
  if (!d) return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">{[0, 1, 2].map(i => <div key={i} className="h-28 animate-pulse rounded-xl border border-neutral-200 bg-neutral-50" />)}</div>
      <div className="h-64 animate-pulse rounded-xl border border-neutral-200 bg-neutral-50" />
    </div>
  )

  const cop = d.moneda === 'COP'
  const dinero = (x: number) => `$${x.toLocaleString('de-DE', { minimumFractionDigits: cop ? 0 : 2, maximumFractionDigits: cop ? 0 : 2 })}`
  const valor = (p: Fila) => orden === 'unidades' ? `${p.unidades.toLocaleString('es-VE')} u` : dinero(orden === 'venta' ? p.venta : p.ganancia ?? 0)
  const tot = filas.reduce((s, p) => ({ u: s.u + p.unidades, v: s.v + p.venta, g: s.g + (p.ganancia ?? 0) }), { u: 0, v: 0, g: 0 })
  const totalOrden = ordenadas.reduce((s, p) => s + Math.max(0, p[orden] ?? 0), 0)
  const peso10 = totalOrden ? Math.round(ordenadas.slice(0, 10).reduce((s, p) => s + Math.max(0, p[orden] ?? 0), 0) / totalOrden * 100) : 0
  const podio = buscar.trim() ? [] : ordenadas.slice(0, 3)
  const resto = buscar.trim() ? filas : ordenadas.slice(3)
  const max = Math.max(1, ...ordenadas.map(p => Math.max(0, p[orden] ?? 0)))
  const ORDENES: [Orden, string][] = [['unidades', 'Unidades'], ['venta', 'Venta'], ...(d.verCostos ? [['ganancia', 'Ganancia'] as [Orden, string]] : [])]

  const excel = async () => {
    const XLSX = await import('xlsx')
    const enc = ['#', 'Código', 'Producto', 'Categoría', 'Unidades', 'Período anterior', 'Venta', ...(d.verCostos ? ['Costo', 'Comisión ML', 'Ganancia'] : [])]
    const aoa: (string | number)[][] = [enc, ...filas.map((p, i) => [i + 1, p.code, p.nombre, p.categoria ?? '', p.unidades, p.antes, p.venta,
      ...(d.verCostos ? [p.costo ?? 0, p.comision ?? 0, p.ganancia ?? 0] : [])]),
      [], ['', '', 'TOTAL', '', tot.u, '', Math.round(tot.v * 100) / 100, ...(d.verCostos ? ['', '', Math.round(tot.g * 100) / 100] : [])]]
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    ws['!cols'] = [{ wch: 4 }, { wch: 10 }, { wch: 44 }, { wch: 14 }, { wch: 9 }, { wch: 10 }, { wch: 11 }, { wch: 11 }, { wch: 11 }, { wch: 11 }]
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Por producto')
    XLSX.writeFile(wb, `ventas_por_producto_${d.desde}_${d.hasta}.xlsx`)
  }

  if (!ordenadas.length) return (
    <div className="rounded-xl border border-neutral-200 bg-white px-4 py-12 text-center">
      <p className="text-sm font-medium text-neutral-700">No hay ventas en estas fechas</p>
      <p className="mt-0.5 text-xs text-neutral-500">Elige otro período arriba. Se cuentan las ventas procesadas.</p>
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Ordenar por" className="inline-flex rounded-lg bg-neutral-100 p-0.5">
          {ORDENES.map(([k, t]) => (
            <button key={k} type="button" role="tab" aria-selected={orden === k} onClick={() => setOrden(k)}
              className={`rounded-md px-3 py-1 text-sm transition-colors ${orden === k ? 'bg-white font-medium text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-800'}`}>{t}</button>
          ))}
        </div>
        <input type="search" value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar producto…"
          className="min-w-0 flex-1 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-800 sm:max-w-xs" />
        <button type="button" onClick={excel} disabled={!filas.length} className="btn-secondary text-sm sm:ml-auto">Excel</button>
      </div>
      <p className="text-xs text-neutral-500">
        {ordenadas.length} productos vendidos · comparado con {textoRango(d.antesDesde, d.antesHasta)}
        {ordenadas.length > 10 && <> · los 10 primeros son el <b className="text-neutral-700">{peso10}%</b> de {orden === 'unidades' ? 'las unidades' : orden === 'venta' ? 'lo vendido' : 'la ganancia'}</>}
      </p>

      {podio.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          {podio.map((p, i) => (
            <div key={p.id} className={`rounded-xl border bg-white px-4 py-3 shadow-sm ${i === 0 ? 'border-amber-300 ring-1 ring-amber-200' : 'border-neutral-200'}`}>
              <div className="flex items-center justify-between">
                <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${i === 0 ? 'bg-amber-100 text-amber-800' : 'bg-neutral-100 text-neutral-700'}`}>{i + 1}</span>
                <span className="text-xs num"><Variacion ahora={p.unidades} antes={p.antes} /></span>
              </div>
              <p className="mt-2 line-clamp-2 min-h-[2.5rem] text-sm font-medium leading-5 text-neutral-900" title={p.nombre}>{p.nombre}</p>
              <p className="num mt-1 text-2xl font-semibold tracking-tight text-neutral-900">{valor(p)}</p>
              <p className="num text-xs text-neutral-500">
                {orden === 'unidades' ? dinero(p.venta) : `${p.unidades.toLocaleString('es-VE')} u`}
                {d.verCostos && orden !== 'ganancia' && p.ganancia != null && <> · ganancia {dinero(p.ganancia)}</>}
              </p>
            </div>
          ))}
        </div>
      )}

      {resto.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs text-neutral-500">
              <tr>
                <th className="w-12 py-2 pl-4 font-medium">#</th>
                <th className="py-2 pr-3 font-medium">Producto</th>
                <th className="w-24 px-3 py-2 text-right font-medium">Unidades</th>
                <th className="hidden w-28 px-3 py-2 text-right font-medium sm:table-cell">Venta</th>
                {d.verCostos && <th className="hidden w-32 py-2 pl-3 pr-4 text-right font-medium md:table-cell">Ganancia</th>}
              </tr>
            </thead>
            <tbody>
              {resto.map(p => {
                const puesto = ordenadas.indexOf(p) + 1
                return (
                  <tr key={p.id} className="border-t border-neutral-100 hover:bg-neutral-50">
                    <td className="py-2.5 pl-4 text-xs text-neutral-400 num">{puesto}</td>
                    <td className="max-w-0 py-2.5 pr-3">
                      <p className="truncate text-neutral-900" title={p.nombre}>{p.nombre}</p>
                      <div className="mt-1 flex items-center gap-2">
                        <div className="h-1.5 flex-1 rounded-full bg-neutral-100">
                          <div className="h-1.5 rounded-full bg-sky-500" style={{ width: `${Math.max(2, Math.max(0, p[orden] ?? 0) / max * 100)}%` }} />
                        </div>
                        <span className="hidden shrink-0 truncate text-[11px] text-neutral-400 lg:inline"><span className="font-mono">{p.code}</span>{p.categoria ? ` · ${p.categoria}` : ''}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <span className="num font-semibold text-neutral-900">{p.unidades.toLocaleString('es-VE')}</span>
                      <span className="num block text-[11px]"><Variacion ahora={p.unidades} antes={p.antes} /></span>
                    </td>
                    <td className="num hidden px-3 py-2.5 text-right text-neutral-700 sm:table-cell">{dinero(p.venta)}</td>
                    {d.verCostos && (
                      <td className="hidden py-2.5 pl-3 pr-4 text-right md:table-cell" title={`Costo ${dinero(p.costo ?? 0)} · comisión ML ${dinero(p.comision ?? 0)}`}>
                        <span className={`num ${(p.ganancia ?? 0) < 0 ? 'text-red-600' : 'text-neutral-900'}`}>{dinero(p.ganancia ?? 0)}</span>
                        {p.venta > 0 && <span className="block text-[11px] text-neutral-400">{Math.round((p.ganancia ?? 0) / p.venta * 100)}% de la venta</span>}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : buscar.trim() ? <p className="rounded-xl border border-neutral-200 bg-white px-4 py-8 text-center text-sm text-neutral-500">Ningún producto coincide.</p> : null}

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm">
        <span className="text-neutral-500">{buscar.trim() ? `${filas.length} de ${ordenadas.length} productos` : `${filas.length} productos`}</span>
        <span className="num flex flex-wrap gap-x-4">
          <span><b>{tot.u.toLocaleString('es-VE')}</b> u</span>
          <span>Venta <b>{dinero(tot.v)}</b></span>
          {d.verCostos && <span>Ganancia <b>{dinero(tot.g)}</b></span>}
        </span>
      </div>
    </div>
  )
}
