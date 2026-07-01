'use client'
import { useState, useRef, useEffect } from 'react'

export interface ComboOption { id: number; name: string }

/**
 * Campo libre con autocompletado (estilo legacy): se escribe libremente, sugiere
 * coincidencias de `options` al escribir y permite seleccionar una; si el texto no
 * coincide con ninguna, se conserva tal cual (id = null) para crear al guardar.
 *
 * onChange entrega (name, id): id != null cuando se eligió una opción existente.
 */
export function Combobox({
  value, onChange, options, placeholder, allowCreate = true, className, onDelete,
  onCreate, createLabel = 'Crear',
}: {
  value: string
  onChange: (name: string, id: number | null) => void
  options: ComboOption[]
  placeholder?: string
  allowCreate?: boolean
  className?: string
  /** Si se provee, cada opción existente muestra una "x" para eliminarla. */
  onDelete?: (opt: ComboOption) => void
  /** Si se provee, al pulsar la opción de crear se ejecuta (además de cerrar). */
  onCreate?: (name: string) => void
  /** Verbo de la opción de crear (ej. "Crear", "Agregar", "Guardar"). */
  createLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const q = value.trim().toLowerCase()
  const matches = q ? options.filter(o => o.name.toLowerCase().includes(q)) : options
  const exact = options.some(o => o.name.toLowerCase() === q)
  const showCreate = allowCreate && q.length > 0 && !exact

  return (
    <div ref={ref} className="relative">
      <input
        value={value}
        onChange={e => { onChange(e.target.value, null); setOpen(true) }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        autoComplete="off"
        className={className ?? 'w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-800'}
      />
      {open && (matches.length > 0 || showCreate) && (
        <div className="absolute z-20 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-52 overflow-y-auto">
          {matches.slice(0, 30).map(o => (
            <div key={o.id} className="flex items-center hover:bg-neutral-50 group">
              <button type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => { onChange(o.name, o.id); setOpen(false) }}
                className="flex-1 text-left px-3 py-2 text-sm">
                {o.name}
              </button>
              {onDelete && (
                <button type="button" title="Eliminar"
                  onMouseDown={e => e.preventDefault()}
                  onClick={e => { e.stopPropagation(); onDelete(o) }}
                  className="px-2 py-2 text-neutral-300 hover:text-red-600 text-sm">
                  ✕
                </button>
              )}
            </div>
          ))}
          {showCreate && (
            <button type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={() => { onCreate?.(value.trim()); setOpen(false) }}
              className="w-full text-left px-3 py-2 text-sm text-green-700 hover:bg-green-50 border-t border-neutral-100">
              + {createLabel} «{value.trim()}»
            </button>
          )}
        </div>
      )}
    </div>
  )
}
