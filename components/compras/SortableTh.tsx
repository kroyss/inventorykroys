'use client'

export type SortDir = 'asc' | 'desc'
export interface SortState { key: string; dir: SortDir }

/** Columnas cuyo primer click ordena descendente (números y fechas). El resto, ascendente. */
const NUM_DESC = new Set(['productos', 'cantidad', 'cajas', 'total', 'updated_at'])

/** Alterna el estado de orden al clickear un encabezado. */
export function toggleSort(prev: SortState, key: string): SortState {
  if (prev.key === key) return { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
  return { key, dir: NUM_DESC.has(key) ? 'desc' : 'asc' }
}

interface Props {
  label: string
  sortKey: string
  sort: SortState
  onSort: (key: string) => void
  align?: 'left' | 'right' | 'center'
  title?: string
  /** Clases extra (p.ej. padding reducido "px-2" para angostar la columna). */
  className?: string
}

/** Encabezado de tabla clickeable que muestra la dirección de orden activa. */
export function SortableTh({ label, sortKey, sort, onSort, align = 'left', title, className }: Props) {
  const active = sort.key === sortKey
  const alignCls = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
  const rowCls = align === 'right' ? 'flex-row-reverse' : align === 'center' ? 'justify-center' : ''
  return (
    <th
      className={`${className ?? 'px-3'} py-2 ${alignCls} cursor-pointer select-none hover:text-neutral-800 transition-colors`}
      title={title ?? `Ordenar por ${label.toLowerCase()}`}
      onClick={() => onSort(sortKey)}
    >
      <span className={`inline-flex items-center gap-1 ${rowCls}`}>
        {label}
        {active && <span className="text-neutral-800 text-[9px]">{sort.dir === 'asc' ? '▲' : '▼'}</span>}
      </span>
    </th>
  )
}
