'use client'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

export interface CuentaML { nickname: string; estado: string; con_error: boolean }

// Botón discreto del encabezado de Automatizaciones: cuántas cuentas de MercadoLibre hay conectadas y,
// al tocarlo, cuáles (con su estado) + conectar otra. Manejarlas (desconectar, reconectar, link para
// otra PC) sigue en Preguntas → Cuentas y políticas.
export default function CuentasConectadas({ cuentas, esAdmin }: { cuentas: CuentaML[]; esAdmin: boolean }) {
  const [abierto, setAbierto] = useState(false)
  const caja = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!abierto) return
    const fuera = (e: MouseEvent) => { if (!caja.current?.contains(e.target as Node)) setAbierto(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false) }
    document.addEventListener('mousedown', fuera)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', esc) }
  }, [abierto])

  const activas = cuentas.filter(c => c.estado === 'activa').length
  const problema = cuentas.some(c => c.estado !== 'activa' || c.con_error)

  return (
    <div ref={caja} className="relative">
      <button onClick={() => setAbierto(a => !a)} aria-expanded={abierto}
        className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3 py-1 text-sm text-neutral-600 hover:border-neutral-400">
        <span className={`w-2 h-2 rounded-full ${problema ? 'bg-red-500' : 'bg-lime-500'}`} aria-hidden="true" />
        Cuentas conectadas · <span className="num font-medium text-neutral-800">{activas}</span>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {abierto && (
        <div className="absolute right-0 z-20 mt-2 w-64 rounded-xl border border-neutral-200 bg-white p-2 shadow-lg">
          <ul className="space-y-0.5">
            {cuentas.map(c => {
              const mal = c.estado !== 'activa' || c.con_error
              return (
                <li key={c.nickname} className="flex items-center gap-2 px-2 py-1.5 text-sm">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${mal ? 'bg-red-500' : 'bg-lime-500'}`} aria-hidden="true" />
                  <span className="font-medium text-neutral-800 truncate">{c.nickname}</span>
                  <span className={`ml-auto text-xs ${mal ? 'text-red-600' : 'text-neutral-400'}`}>
                    {c.estado !== 'activa' ? 'desconectada' : c.con_error ? 'con error' : 'conectada'}
                  </span>
                </li>
              )
            })}
          </ul>
          {esAdmin && (
            <div className="mt-1 border-t border-neutral-100 pt-1">
              <a href="/conectar" className="block rounded-md px-2 py-1.5 text-sm font-medium text-lime-800 hover:bg-neutral-50">+ Conectar otra cuenta</a>
              <Link href="/preguntas?vista=cuentas" className="block rounded-md px-2 py-1.5 text-sm text-neutral-600 hover:bg-neutral-50">Administrar cuentas →</Link>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
