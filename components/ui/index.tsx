'use client'
import { ReactNode, useState, useMemo } from 'react'
import Link from 'next/link'
import { DateField } from '@/components/ui/DateField'

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

// ── Estados (ventas / compras / importaciones / stock) ─────────────────────
// Etiqueta neutra con un punto de color que dice qué significa:
//   gris = no empezó · celeste = en curso · ámbar = te toca hacer algo
//   verde = terminado / sano · rojo = problema
type Tono = 'gris' | 'curso' | 'atencion' | 'ok' | 'problema'
const TONO_ESTADO: Record<string, Tono> = {
  BORRADOR: 'gris', PENDIENTE: 'gris', PAGO_PARCIAL: 'gris', INACTIVO: 'gris',
  PROCESADA: 'curso', PAGADA: 'curso', EN_TRANSITO: 'curso', ADUANA: 'curso', EN_CAMINO: 'curso',
  PAGO_VERIFICADO: 'atencion', RECIBIDA: 'atencion', PARCIAL: 'atencion', ESPERANDO_FOTOS: 'atencion',
  EN_IMPORTADOR_PAGAR: 'atencion', REABIERTA: 'atencion', BAJO: 'atencion',
  DESCARGADA: 'ok', DESCARGADA_LOCAL: 'ok', FINALIZADA: 'ok', OK: 'ok',
  INCONSISTENTE: 'problema', SIN_STOCK: 'problema',
}
const PUNTO: Record<Tono, string> = {
  gris: 'bg-neutral-400', curso: 'bg-sky-500', atencion: 'bg-amber-500', ok: 'bg-emerald-500', problema: 'bg-red-500',
}
// Nombre en español por defecto (cada pantalla puede pasar el suyo en `label`).
export const STATUS_LABELS: Record<string, string> = {
  BORRADOR: 'Borrador', PAGO_VERIFICADO: 'Pago verificado', PROCESADA: 'Procesada',
  DESCARGADA: 'Descargada', DESCARGADA_LOCAL: 'Local entregada', REABIERTA: 'Reabierta',
  PENDIENTE: 'Pendiente', PAGADA: 'Pagada', EN_CAMINO: 'En camino', RECIBIDA: 'Recibida',
  PARCIAL: 'Parcial', FINALIZADA: 'Finalizada', INCONSISTENTE: 'Inconsistente',
  PAGO_PARCIAL: 'Pago 50%', ESPERANDO_FOTOS: 'Esperando fotos', EN_TRANSITO: 'En tránsito',
  ADUANA: 'En aduana', EN_IMPORTADOR_PAGAR: 'Importador por pagar',
  OK: 'En nivel', BAJO: 'Stock bajo', SIN_STOCK: 'Sin stock', INACTIVO: 'Inactivo',
}
/** @deprecated usar StatusBadge; se deja por compatibilidad. */
export const STATUS_STYLES: Record<string, string> = Object.fromEntries(
  Object.keys(TONO_ESTADO).map(k => [k, 'bg-white text-neutral-700 ring-1 ring-inset ring-neutral-200']))

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const tono = TONO_ESTADO[status] ?? 'gris'
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap bg-white text-neutral-700 ring-1 ring-inset ring-neutral-200">
      <span className={`w-1.5 h-1.5 rounded-full ${PUNTO[tono]}`} aria-hidden="true" />
      {label ?? STATUS_LABELS[status] ?? status}
    </span>
  )
}

// ── Tarjeta de número ───────────────────────────────────────────────────────
// El número va en negro. `tone` solo cuando el color significa algo:
// problema (rojo), atencion (ámbar), bueno (verde), apagado (gris).
export type KpiTone = 'neutro' | 'problema' | 'atencion' | 'bueno' | 'apagado'
const TONO_KPI: Record<KpiTone, string> = {
  neutro: 'text-neutral-900', problema: 'text-red-600', atencion: 'text-amber-600',
  bueno: 'text-emerald-600', apagado: 'text-neutral-400',
}
export function KPICard({ label, value, sub, accent, tone, href, compact, active, onClick }: {
  label: string; value: string | number; sub?: ReactNode
  /** @deprecated usar `tone` */ accent?: string
  tone?: KpiTone; href?: string; compact?: boolean
  active?: boolean; onClick?: () => void
}) {
  const padding = compact ? 'px-3 py-2.5' : 'px-4 py-3.5'
  const valueSize = compact ? 'text-xl' : 'text-2xl'
  const color = tone ? TONO_KPI[tone] : (accent ?? 'text-neutral-900')
  const inner = (
    <>
      <div className="text-xs font-medium text-neutral-500 mb-1 flex items-center justify-between gap-2">
        {label}
        {(href || onClick) && <span className="text-neutral-300 group-hover:text-neutral-500 transition-colors">→</span>}
      </div>
      <div className={`${valueSize} font-semibold tracking-tight num ${color}`}>{value}</div>
      {sub && <div className="text-xs text-neutral-500 mt-1">{sub}</div>}
    </>
  )
  const base = `group bg-white rounded-xl border ${padding} shadow-sm text-left ${
    active ? 'border-neutral-900 ring-1 ring-neutral-900' : 'border-neutral-200'}`
  const hover = 'hover:border-neutral-400 hover:shadow transition-all'
  if (href) return <Link href={href} className={`${base} ${hover} block`}>{inner}</Link>
  if (onClick) return <button type="button" onClick={onClick} className={`${base} ${hover} block w-full`}>{inner}</button>
  return <div className={base}>{inner}</div>
}

// ── Encabezado de página ────────────────────────────────────────────────────
// Igual en todas las pantallas: título (+ subtítulo) a la izquierda, acciones a la
// derecha. Una sola acción principal (btn-primary) por pantalla.
export function PageHeader({ title, subtitle, actions }: {
  title: ReactNode; subtitle?: ReactNode; actions?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">{title}</h1>
        {subtitle && <p className="text-sm text-neutral-500 mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

// ── Pestañas (secciones de una pantalla) ────────────────────────────────────
// Subrayado con el verde de la marca. Para FILTROS usar FilterPills (chips).
// `group` separa grupos con una rayita (p.ej. Reportes: por período / estado actual).
export interface TabItem<T extends string> { value: T; label: ReactNode; count?: number; group?: string }
export function Tabs<T extends string>({ items, value, onChange, className = '' }: {
  items: TabItem<T>[]; value: T; onChange: (v: T) => void; className?: string
}) {
  return (
    <div className={`flex items-end gap-1 border-b border-neutral-200 overflow-x-auto ${className}`} role="tablist">
      {items.map((t, i) => {
        const on = t.value === value
        const sep = i > 0 && t.group && t.group !== items[i - 1].group
        return (
          <div key={t.value} className="flex items-end">
            {sep && <span className="self-center h-5 w-px bg-neutral-200 mx-2" aria-hidden="true" />}
            <button type="button" role="tab" aria-selected={on} onClick={() => onChange(t.value)}
              className={`relative px-3 pb-2.5 pt-1.5 text-sm whitespace-nowrap transition-colors ${
                on ? 'font-semibold text-neutral-900' : 'font-medium text-neutral-500 hover:text-neutral-800'}`}>
              {t.label}
              {t.count !== undefined && (
                <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full num ${on ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-500'}`}>
                  {t.count}
                </span>
              )}
              {on && <span className="absolute left-2 right-2 -bottom-px h-0.5 rounded-full bg-[var(--marca-fuerte)]" />}
            </button>
          </div>
        )
      })}
    </div>
  )
}

// ── Menú de acciones de una fila (⋯) ────────────────────────────────────────
export function RowMenu({ items }: {
  items: { label: string; onClick: () => void; danger?: boolean; hidden?: boolean }[]
}) {
  const [open, setOpen] = useState(false)
  const visibles = items.filter(i => !i.hidden)
  if (visibles.length === 0) return null
  return (
    <div className="relative inline-block" onClick={e => e.stopPropagation()}>
      <button type="button" onClick={() => setOpen(o => !o)} aria-label="Acciones" aria-haspopup="menu"
        className="w-8 h-8 inline-flex items-center justify-center rounded-md text-neutral-400 hover:text-neutral-800 hover:bg-neutral-100">
        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" />
        </svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div role="menu" className="absolute right-0 top-full mt-1 z-30 min-w-[10rem] bg-white border border-neutral-200 rounded-lg shadow-lg p-1">
            {visibles.map(i => (
              <button key={i.label} type="button" role="menuitem"
                onClick={() => { setOpen(false); i.onClick() }}
                className={`block w-full text-left px-3 py-1.5 text-sm rounded-md ${
                  i.danger ? 'text-red-600 hover:bg-red-50' : 'text-neutral-700 hover:bg-neutral-100'}`}>
                {i.label}
              </button>
            ))}
          </div>
        </>
      )}
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

// ── Carga (en vez de "Cargando…" suelto) ────────────────────────────────────
export function Cargando({ filas = 6 }: { filas?: number }) {
  return (
    <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4 space-y-3 animate-pulse" aria-label="Cargando">
      <div className="h-4 w-40 bg-neutral-200 rounded" />
      {Array.from({ length: filas }, (_, i) => <div key={i} className="h-3 bg-neutral-100 rounded" />)}
    </div>
  )
}

// ── Filtros (chips) ─────────────────────────────────────────────────────────
export const chipCls = (on: boolean) =>
  `px-3 py-1 text-xs font-medium rounded-full border transition-colors whitespace-nowrap ${
    on ? 'bg-neutral-900 text-white border-neutral-900' : 'bg-white text-neutral-600 border-neutral-200 hover:border-neutral-400'}`

export function FilterPills<T extends string>({ options, value, onChange }: {
  options: { value: T; label: string; count?: number }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {options.map(o => (
        <button key={o.value} onClick={() => onChange(o.value)} className={chipCls(value === o.value)}>
          {o.label}
          {o.count !== undefined && <span className={`ml-1 num ${value === o.value ? 'text-white/60' : 'text-neutral-400'}`}>{o.count}</span>}
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
                done ? 'bg-emerald-500 text-white'
                  : active ? 'bg-neutral-900 text-white ring-2 ring-lime-300'
                  : 'bg-neutral-200 text-neutral-400'
              }`}>
                {done ? '✓' : i + 1}
              </div>
              <span className={`text-[10px] mt-1 whitespace-nowrap ${active ? 'font-semibold text-neutral-900' : 'text-neutral-400'}`}>
                {s.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={`h-0.5 w-6 mx-0.5 mb-4 ${done ? 'bg-emerald-500' : 'bg-neutral-200'}`} />
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
            className={chipCls(preset === p.value)}>
            {p.label}
          </button>
        ))}
      </div>
      {preset === 'custom' && (
        <>
          <div>
            <label className="text-xs text-neutral-500 block">Desde</label>
            <DateField value={from} onChange={(v: string) => onFrom(v)}
              className="mt-1 border rounded px-2 py-1 text-sm" />
          </div>
          <div>
            <label className="text-xs text-neutral-500 block">Hasta</label>
            <DateField value={to} onChange={(v: string) => onTo(v)}
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
      <div className="overflow-auto max-h-[70vh]">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-xs font-medium text-neutral-500 sticky top-0 z-10 shadow-[0_1px_0_rgba(0,0,0,0.06)]">
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
            className="btn-secondary text-xs px-3 py-1">
            Cargar {pageSize} más ({sorted.length - visible} restantes)
          </button>
        </div>
      )}
    </div>
  )
}
