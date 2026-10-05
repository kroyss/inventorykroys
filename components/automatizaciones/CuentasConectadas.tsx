'use client'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

export interface CuentaML { nickname: string; estado: string; con_error: boolean }

// Botón del encabezado de Automatizaciones (mismo estilo que los botones secundarios y el menú de la
// cuenta): cuántas cuentas de MercadoLibre hay y, al tocarlo, cuáles + conectar otra. Manejarlas
// (desconectar, reconectar, link para otra PC) sigue en Preguntas → Cuentas y políticas.
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
  const conProblema = cuentas.filter(c => c.estado !== 'activa' || c.con_error).length
  const fila = 'flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors'

  return (
    <div ref={caja} className="relative">
      <button type="button" onClick={() => setAbierto(a => !a)} aria-haspopup="menu" aria-expanded={abierto}
        className={`btn-secondary ${abierto ? 'bg-neutral-50 border-neutral-400' : ''}`}>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"
          strokeLinejoin="round" className="w-4 h-4 text-neutral-500">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
        Cuentas de MercadoLibre
        <span className={`min-w-[1.25rem] h-5 px-1.5 rounded-full text-xs font-semibold flex items-center justify-center num ${
          conProblema ? 'bg-red-500 text-white' : 'bg-neutral-100 text-neutral-700'}`}
          title={conProblema ? `${conProblema} con problema` : undefined}>{activas}</span>
        <svg viewBox="0 0 24 24" className={`w-4 h-4 text-neutral-400 transition-transform ${abierto ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
      </button>

      {abierto && (
        <div role="menu" className="absolute right-0 top-full mt-1.5 w-64 bg-white border border-neutral-200 rounded-xl shadow-lg p-1.5 z-30">
          <p className="px-3 pt-1.5 pb-1 text-xs font-medium text-neutral-500">Conectadas al sistema</p>
          {cuentas.map(c => {
            const mal = c.estado !== 'activa' || c.con_error
            return (
              <div key={c.nickname} className={`${fila} text-neutral-800`}>
                <span className="truncate font-medium">{c.nickname}</span>
                <span className={`ml-auto text-xs ${mal ? 'text-red-600 font-medium' : 'text-neutral-400'}`}>
                  {c.estado !== 'activa' ? 'Desconectada' : c.con_error ? 'Con error' : 'Conectada'}
                </span>
              </div>
            )
          })}
          {esAdmin && (
            <>
              <div className="my-1 border-t border-neutral-100" />
              <a href="/conectar" role="menuitem" className={`${fila} text-neutral-700 hover:bg-neutral-50`}>
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="w-4 h-4 text-neutral-500"><path d="M12 5v14M5 12h14" /></svg>
                Conectar otra cuenta
              </a>
              <Link href="/preguntas?vista=cuentas" role="menuitem" onClick={() => setAbierto(false)} className={`${fila} text-neutral-700 hover:bg-neutral-50`}>
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-neutral-500">
                  <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
                Administrar cuentas
              </Link>
            </>
          )}
        </div>
      )}
    </div>
  )
}
