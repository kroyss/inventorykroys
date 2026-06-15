'use client'
import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import type { UserRole, Country } from '@/lib/types'

interface Command {
  label: string
  hint: string
  action: () => void
  roles: string[]
  countries: string[]
}

export default function CommandPalette({ role, country }: { role: UserRole; country: Country }) {
  const router = useRouter()
  const [open, setOpen]   = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)

  // Toggle with Cmd/Ctrl+K
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(o => !o)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => { if (open) { setQuery(''); setActive(0) } }, [open])

  const go = (href: string) => () => { setOpen(false); router.push(href) }

  const commands = useMemo<Command[]>(() => [
    { label: 'Ir a Inicio',       hint: 'Dashboard', action: go('/dashboard'),  roles: ['admin','user'], countries: ['VE','CO'] },
    { label: 'Ir a Ventas',       hint: 'Navegar',   action: go('/ventas'),     roles: ['admin','user'], countries: ['VE','CO'] },
    { label: 'Ir a Inventario',   hint: 'Navegar',   action: go('/inventario'), roles: ['admin','user'], countries: ['VE','CO'] },
    { label: role === 'user' ? 'Ir a Recepciones' : 'Ir a Compras', hint: 'Navegar', action: go('/compras'), roles: ['admin','user'], countries: ['VE','CO'] },
    { label: 'Ir a Productos',    hint: 'Navegar',   action: go('/productos'),  roles: ['admin'],        countries: ['VE','CO'] },
    { label: 'Ir a Reportes',     hint: 'Navegar',   action: go('/reportes'),   roles: ['admin'],        countries: ['VE','CO'] },
    { label: 'Ir a Tasas',        hint: 'Navegar',   action: go('/tasas'),      roles: ['admin'],        countries: ['VE'] },
    { label: 'Nueva venta',       hint: 'Acción',    action: go('/ventas?new=1'),    roles: ['admin','user'], countries: ['VE','CO'] },
    { label: 'Nueva compra',      hint: 'Acción',    action: go('/compras?new=1'),   roles: ['admin'],        countries: ['VE','CO'] },
    { label: 'Nuevo producto',    hint: 'Acción',    action: go('/productos?new=1'), roles: ['admin'],        countries: ['VE','CO'] },
  ].filter(c => c.roles.includes(role) && c.countries.includes(country)), [role, country, router])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return commands
    return commands.filter(c => c.label.toLowerCase().includes(q) || c.hint.toLowerCase().includes(q))
  }, [commands, query])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[15vh] bg-black/30"
      onClick={() => setOpen(false)}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden"
        onClick={e => e.stopPropagation()}>
        <input
          autoFocus
          value={query}
          onChange={e => { setQuery(e.target.value); setActive(0) }}
          onKeyDown={e => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, filtered.length - 1)) }
            if (e.key === 'ArrowUp')   { e.preventDefault(); setActive(a => Math.max(a - 1, 0)) }
            if (e.key === 'Enter')     { e.preventDefault(); filtered[active]?.action() }
          }}
          placeholder="Buscar acción o página…  (Esc para cerrar)"
          className="w-full px-4 py-3 text-sm border-b border-neutral-100 focus:outline-none"
        />
        <ul className="max-h-80 overflow-y-auto py-1">
          {filtered.map((c, i) => (
            <li key={c.label}>
              <button
                onMouseEnter={() => setActive(i)}
                onClick={c.action}
                className={`w-full flex items-center justify-between px-4 py-2 text-sm text-left ${i === active ? 'bg-neutral-100' : ''}`}>
                <span className="text-neutral-800">{c.label}</span>
                <span className="text-xs text-neutral-400">{c.hint}</span>
              </button>
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-neutral-400">Sin resultados</li>
          )}
        </ul>
      </div>
    </div>
  )
}
