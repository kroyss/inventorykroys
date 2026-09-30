'use client'
import { useRef } from 'react'

// Campos de fecha en español, sin depender del idioma del navegador (el <input type="date">
// nativo muestra "mm/dd/yyyy" o "September 2026" si Chrome está en inglés).
// El valor sigue siendo el de siempre: 'AAAA-MM-DD' (DateField) y 'AAAA-MM' (MonthField).

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio',
  'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

function mostrar(v: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ''
}

/** Fecha: muestra dd/mm/aaaa y abre el calendario del navegador al hacer clic. */
export function DateField({ value, onChange, min, max, title, placeholder = 'dd/mm/aaaa', className = '', clearable }: {
  value: string; onChange: (v: string) => void
  min?: string; max?: string; title?: string; placeholder?: string; className?: string
  /** muestra una ✕ para dejarla vacía */ clearable?: boolean
}) {
  const ref = useRef<HTMLInputElement>(null)
  const abrir = () => {
    const el = ref.current
    if (!el) return
    try { el.showPicker() } catch { el.focus(); el.click() }
  }
  const base = className || 'border border-neutral-300 rounded-lg px-3 py-2 text-sm'
  const ancho = /w-full/.test(base)
  return (
    <span className={`relative ${ancho ? 'flex w-full' : 'inline-flex'}`}>
      <button type="button" onClick={abrir} title={title}
        className={`${base} inline-flex items-center justify-between gap-2 bg-white text-left whitespace-nowrap hover:border-neutral-400`}>
        <span className={`num ${value ? 'text-neutral-900' : 'text-neutral-400'}`}>{mostrar(value) || placeholder}</span>
        <svg viewBox="0 0 24 24" className="w-4 h-4 text-neutral-400 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8}
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4" />
        </svg>
        {clearable && value && (
          <span role="button" tabIndex={-1} aria-label="Quitar fecha" title="Quitar fecha"
            onClick={e => { e.stopPropagation(); onChange('') }}
            className="-mr-1 text-neutral-400 hover:text-neutral-700">✕</span>
        )}
      </button>
      {/* el input nativo solo aporta el calendario: invisible y debajo del botón */}
      <input ref={ref} type="date" value={value} min={min} max={max} tabIndex={-1} aria-hidden="true"
        onChange={e => onChange(e.target.value)}
        className="absolute inset-0 opacity-0 pointer-events-none" />
    </span>
  )
}

/** Mes: ‹ Septiembre 2026 › */
export function MonthField({ value, onChange, className = '' }: {
  value: string; onChange: (v: string) => void; className?: string
}) {
  const m = /^(\d{4})-(\d{2})$/.exec(value)
  const anio = m ? Number(m[1]) : new Date().getFullYear()
  const mes  = m ? Number(m[2]) - 1 : new Date().getMonth()
  const mover = (d: number) => {
    const t = anio * 12 + mes + d
    onChange(`${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`)
  }
  const flecha = 'w-8 h-full inline-flex items-center justify-center text-neutral-500 hover:text-neutral-900 hover:bg-neutral-50'
  return (
    <span className={`inline-flex items-stretch h-9 border border-neutral-300 rounded-lg bg-white overflow-hidden ${className}`}>
      <button type="button" onClick={() => mover(-1)} className={flecha} aria-label="Mes anterior">‹</button>
      <span className="px-2 min-w-[9.5rem] inline-flex items-center justify-center text-sm font-medium text-neutral-900 border-x border-neutral-200">
        {MESES[mes]} {anio}
      </span>
      <button type="button" onClick={() => mover(1)} className={flecha} aria-label="Mes siguiente">›</button>
    </span>
  )
}
