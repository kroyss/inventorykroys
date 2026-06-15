'use client'
import { ReactNode, useState, useMemo } from 'react'
import Link from 'next/link'

// ── money / number formatting ──────────────────────────────────────────────
export const money = (n: number) =>
  Number(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const int = (n: number) =>
  Number(n).toLocaleString('de-DE', { maximumFractionDigits: 0 })

// ── Excel export (dynamic import keeps xlsx out of the initial bundle) ──────
export async function exportRows(filename: string, rows: Record<string, unknown>[], sheetName = 'Datos') {
  if (rows.length === 0) return
  const XLSX = await import('xlsx')
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  XLSX.writeFile(wb, filename)
}

// ── Status colors (shared across ventas/compras/imports) ────────────────────
export const STATUS_STYLES: Record<string, string> = {
  // sales
  BORRADOR:         'bg-slate-100 text-slate-700',
  PAGO_VERIFICADO:  'bg-amber-100 text-amber-700',
  PROCESADA:        'bg-blue-100 text-blue-700',
  DESCARGADA:       'bg-green-100 text-green-700',
  DESCARGADA_LOCAL: 'bg-emerald-100 text-emerald-700',
  // purchases / imports shared
  PENDIENTE:           'bg-slate-100 text-slate-700',
  PAGADA:              'bg-blue-100 text-blue-700',
  EN_CAMINO:           'bg-yellow-100 text-yellow-700',
  RECIBIDA:            'bg-purple-100 text-purple-700',
  PARCIAL:             'bg-orange-100 text-orange-700',
  FINALIZADA:          'bg-green-100 text-green-700',
  INCONSISTENTE:       'bg-red-100 text-red-700',
  REABIERTA:           'bg-pink-100 text-pink-700',
  // imports-specific
  PAGO_PARCIAL:        'bg-sky-100 text-sky-700',
  ESPERANDO_FOTOS:     'bg-cyan-100 text-cyan-700',
  EN_TRANSITO:         'bg-violet-100 text-violet-700',
  ADUANA:              'bg-amber-100 text-amber-700',
  EN_IMPORTADOR_PAGAR: 'bg-orange-100 text-orange-700',
  // stock
  OK:        'bg-green-100 text-green-700',
  BAJO:      'bg-yellow-100 text-yellow-700',
  SIN_STOCK: 'bg-red-100 text-red-700',
  INACTIVO:  'bg-neutral-100 text-neutral-500',
}

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${STATUS_STYLES[status] ?? 'bg-neutral-100 text-neutral-600'}`}>
      {label ?? status}
    </span>
  )
}

// ── KPI Card ────────────────────────────────────────────────────────────────
export function KPICard({ label, value, sub, accent, href, compact }: {
  label: string; value: string | number; sub?: ReactNode; accent?: string; href?: string; compact?: boolean
}) {
  const padding = compact ? 'p-3' : 'p-4'
  const valueSize = compact ? 'text-xl' : 'text-2xl'
  const inner = (
    <>
      <div className="text-xs text-neutral-500 mb-1 flex items-center justify-between">
        {label}
        {href && <span className="text-neutral-300">→</span>}
      </div>
      <div className={`${valueSize} font-bold tracking-tight ${accent ?? 'text-neutral-900'}`}>{value}</div>
      {sub && <div className="text-xs text-neutral-400 mt-1">{sub}</div>}
    </>
  )
  const base = `bg-white rounded-xl border border-neutral-200 ${padding} shadow-sm`
  return href
    ? <Link href={href} className={`${base} block hover:border-neutral-400 hover:shadow-md transition-all`}>{inner}</Link>
    : <div className={base}>{inner}</div>
}

// ── Page Header ─────────────────────────────────────────────────────────────
export function PageHeader({ title, subtitle, actions }: {
  title: string; subtitle?: string; actions?: ReactNode
}) {
  return (
    <div className="flex items-start justify-between mb-4">
      <div>
        <h1 className="text-lg font-bold text-neutral-900">{title}</h1>
        {subtitle && <p className="text-sm text-neutral-500 mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}

// ── Empty State ─────────────────────────────────────────────────────────────
export function EmptyState({ message, cta }: { message: string; cta?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="text-neutral-400 text-sm">{message}</div>
      {cta && <div className="mt-3">{cta}</div>}
    </div>
  )
}

// ── Filter pill bar ─────────────────────────────────────────────────────────
export function FilterPills<T extends string>({ options, value, onChange }: {
  options: { value: T; label: string; count?: number }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="flex gap-1 flex-wrap">
      {options.map(o => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`px-3 py-1 text-xs rounded-full border transition-colors ${
            value === o.value
              ? 'bg-neutral-900 text-white border-neutral-900'
              : 'bg-white text-neutral-600 border-neutral-200 hover:border-neutral-400'
          }`}
        >
          {o.label}{o.count !== undefined ? ` (${o.count})` : ''}
        </button>
      ))}
    </div>
  )
}

// ── Stepper (horizontal state flow) ─────────────────────────────────────────
export function Stepper({ steps, current, terminal }: {
  steps: { key: string; label: string }[]
  current: string
  terminal?: string  // e.g. INCONSISTENTE — shown as a red off-path state
}) {
  const currentIdx = steps.findIndex(s => s.key === current)
  const isTerminal = terminal && current === terminal

  return (
    <div className="flex items-center gap-0 overflow-x-auto py-1">
      {steps.map((s, i) => {
        const done    = !isTerminal && i < currentIdx
        const active  = !isTerminal && i === currentIdx
        return (
          <div key={s.key} className="flex items-center shrink-0">
            <div className="flex flex-col items-center">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                done ? 'bg-green-500 text-white'
                  : active ? 'bg-blue-600 text-white ring-2 ring-blue-200'
                  : 'bg-neutral-200 text-neutral-400'
              }`}>
                {done ? '✓' : i + 1}
              </div>
              <span className={`text-[10px] mt-1 whitespace-nowrap ${active ? 'font-semibold text-blue-700' : 'text-neutral-400'}`}>
                {s.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={`h-0.5 w-6 mx-0.5 mb-4 ${done ? 'bg-green-500' : 'bg-neutral-200'}`} />
            )}
          </div>
        )
      })}
      {isTerminal && (
        <div className="ml-3 mb-4">
          <StatusBadge status={terminal!} label="Inconsistente" />
        </div>
      )}
    </div>
  )
}

// ── Date range with presets ─────────────────────────────────────────────────
export type DatePreset = 'today' | 'week' | 'month' | 'last30' | 'last90' | 'custom'

export function presetRange(preset: DatePreset): { from: string; to: string } {
  const today = new Date()
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  const to = iso(today)
  const d = new Date(today)
  switch (preset) {
    case 'today':  return { from: to, to }
    case 'week':   d.setDate(d.getDate() - 7);  return { from: iso(d), to }
    case 'month':  d.setMonth(d.getMonth() - 1); return { from: iso(d), to }
    case 'last30': d.setDate(d.getDate() - 30); return { from: iso(d), to }
    case 'last90': d.setDate(d.getDate() - 90); return { from: iso(d), to }
    default:       d.setMonth(d.getMonth() - 3); return { from: iso(d), to }
  }
}

export function DateRangeBar({ preset, from, to, onPreset, onFrom, onTo, onApply, loading }: {
  preset: DatePreset
  from: string; to: string
  onPreset: (p: DatePreset) => void
  onFrom: (v: string) => void
  onTo: (v: string) => void
  onApply: () => void
  loading?: boolean
}) {
  const presets: { value: DatePreset; label: string }[] = [
    { value: 'today',  label: 'Hoy' },
    { value: 'week',   label: 'Semana' },
    { value: 'month',  label: 'Mes' },
    { value: 'last30', label: '30 días' },
    { value: 'last90', label: '90 días' },
    { value: 'custom', label: 'Personalizado' },
  ]
  return (
    <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-3 flex flex-wrap gap-3 items-end">
      <div className="flex gap-1 flex-wrap">
        {presets.map(p => (
          <button key={p.value} onClick={() => onPreset(p.value)}
            className={`px-3 py-1 text-xs rounded-full border transition-colors ${
              preset === p.value ? 'bg-neutral-900 text-white border-neutral-900' : 'bg-white text-neutral-600 border-neutral-200 hover:border-neutral-400'
            }`}>
            {p.label}
          </button>
        ))}
      </div>
      {preset === 'custom' && (
        <>
          <div>
            <label className="text-xs text-neutral-500 block">Desde</label>
            <input type="date" value={from} onChange={e => onFrom(e.target.value)}
              className="mt-1 border rounded px-2 py-1 text-sm" />
          </div>
          <div>
            <label className="text-xs text-neutral-500 block">Hasta</label>
            <input type="date" value={to} onChange={e => onTo(e.target.value)}
              className="mt-1 border rounded px-2 py-1 text-sm" />
          </div>
          <button onClick={onApply} disabled={loading} className="btn-primary text-sm">
            {loading ? 'Cargando…' : 'Aplicar'}
          </button>
        </>
      )}
    </div>
  )
}

// ── Paginación clásica (Anterior / Siguiente) ───────────────────────────────
export function Pagination({ total, page, pageSize, onChange }: {
  total: number; page: number; pageSize: number; onChange: (p: number) => void
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const from  = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to    = Math.min(page * pageSize, total)
  if (total === 0) return null
  return (
    <div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-neutral-100 text-xs bg-neutral-50">
      <span className="text-neutral-500">{from}–{to} de {total}</span>
      <div className="flex items-center gap-1">
        <button disabled={page <= 1} onClick={() => onChange(page - 1)}
          className="px-3 py-1 rounded border border-neutral-200 bg-white text-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-neutral-100">
          ← Anterior
        </button>
        <span className="px-2 text-neutral-500">Página {page} de {pages}</span>
        <button disabled={page >= pages} onClick={() => onChange(page + 1)}
          className="px-3 py-1 rounded border border-neutral-200 bg-white text-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-neutral-100">
          Siguiente →
        </button>
      </div>
    </div>
  )
}

// ── DataTable: sortable + zebra + totals row + pagination + Excel export ─────
export interface Column<T> {
  key: string
  label: string
  align?: 'left' | 'right' | 'center'
  render?: (row: T) => ReactNode
  sortValue?: (row: T) => number | string
  total?: (rows: T[]) => ReactNode
  exportValue?: (row: T) => string | number
}

export function DataTable<T extends Record<string, unknown>>({
  columns, rows, pageSize = 50, exportName, emptyText = 'Sin resultados',
}: {
  columns: Column<T>[]
  rows: T[]
  pageSize?: number
  exportName?: string
  emptyText?: string
}) {
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [visible, setVisible] = useState(pageSize)

  const sorted = useMemo(() => {
    if (!sortKey) return rows
    const col = columns.find(c => c.key === sortKey)
    if (!col?.sortValue) return rows
    const arr = [...rows].sort((a, b) => {
      const va = col.sortValue!(a), vb = col.sortValue!(b)
      if (typeof va === 'number' && typeof vb === 'number') return va - vb
      return String(va).localeCompare(String(vb))
    })
    return sortDir === 'desc' ? arr.reverse() : arr
  }, [rows, sortKey, sortDir, columns])

  const shown   = sorted.slice(0, visible)
  const hasMore = sorted.length > visible
  const hasTotals = columns.some(c => c.total)

  const toggleSort = (key: string) => {
    const col = columns.find(c => c.key === key)
    if (!col?.sortValue) return
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const doExport = () => {
    if (!exportName) return
    const data = sorted.map(r => {
      const o: Record<string, unknown> = {}
      for (const c of columns) o[c.label] = c.exportValue ? c.exportValue(r) : (r[c.key] ?? '')
      return o
    })
    exportRows(`${exportName}_${new Date().toISOString().slice(0, 10)}.xlsx`, data, exportName)
  }

  return (
    <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
      {exportName && (
        <div className="flex justify-between items-center px-3 py-2 border-b border-neutral-100">
          <span className="text-xs text-neutral-400">
            Mostrando {shown.length} de {sorted.length}
          </span>
          <button onClick={doExport} disabled={sorted.length === 0}
            className="text-xs px-3 py-1 border border-neutral-200 rounded-lg text-neutral-600 hover:bg-neutral-50 disabled:opacity-40">
            ↓ Exportar Excel
          </button>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-xs text-neutral-500 uppercase">
            <tr>
              {columns.map(c => (
                <th key={c.key}
                  onClick={() => toggleSort(c.key)}
                  className={`px-3 py-2 ${c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left'} ${c.sortValue ? 'cursor-pointer select-none hover:text-neutral-800' : ''}`}>
                  {c.label}
                  {sortKey === c.key && <span className="ml-1">{sortDir === 'asc' ? '▲' : '▼'}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr><td colSpan={columns.length} className="px-3 py-8 text-center text-neutral-400">{emptyText}</td></tr>
            )}
            {shown.map((row, i) => (
              <tr key={i} className={`border-t border-neutral-50 hover:bg-neutral-50 ${i % 2 ? 'bg-neutral-50/40' : ''}`}>
                {columns.map(c => (
                  <td key={c.key} className={`px-3 py-2 ${c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left'}`}>
                    {c.render ? c.render(row) : String(row[c.key] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {hasTotals && shown.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-neutral-200 bg-neutral-50 font-semibold">
                {columns.map(c => (
                  <td key={c.key} className={`px-3 py-2 ${c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left'}`}>
                    {c.total ? c.total(sorted) : c.key === columns[0].key ? 'Total' : ''}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {hasMore && (
        <div className="px-3 py-2 border-t border-neutral-100 text-center">
          <button onClick={() => setVisible(v => v + pageSize)}
            className="text-xs px-3 py-1 bg-neutral-100 hover:bg-neutral-200 rounded text-neutral-700">
            Cargar {pageSize} más ({sorted.length - visible} restantes)
          </button>
        </div>
      )}
    </div>
  )
}
