'use client'
import { useEffect, useState, type ReactNode } from 'react'

/** Franja de aviso con ✕ que se cierra por la `llave` (guardada en el navegador; AvisosLista deja de contarla). */
export default function AvisoCerrable({ llave, clase, children }: { llave: string; clase: string; children: ReactNode }) {
  const [ver, setVer] = useState(false)
  // eslint-disable-next-line react-hooks/set-state-in-effect -- se lee del navegador después de montar
  useEffect(() => { try { setVer(!localStorage.getItem(llave)) } catch { setVer(true) } }, [llave])
  if (!ver) return null
  return (
    <div className={`relative border-b text-center pl-4 pr-10 ${clase}`}>
      {children}
      <button type="button" aria-label="Cerrar aviso" title="Cerrar por esta semana"
        onClick={() => { try { localStorage.setItem(llave, '1') } catch { /* sin almacenamiento */ } setVer(false); window.dispatchEvent(new Event('aviso-cerrado')) }}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-0.5 opacity-70 hover:opacity-100 hover:bg-black/5">✕</button>
    </div>
  )
}
