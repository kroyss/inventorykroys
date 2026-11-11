'use client'
import { useEffect, useState } from 'react'

/** La barra del aviso de Radar PRO (AvisoRadarPro): ✕ la cierra hasta el próximo fin de semana (se guarda en el navegador). */
export default function AvisoRadarProBarra({ semana, url }: { semana: string; url: string }) {
  const llave = `radarpro:${semana}`
  const [ver, setVer] = useState(false)
  useEffect(() => { try { setVer(!localStorage.getItem(llave)) } catch { setVer(true) } }, [llave])
  if (!ver) return null
  return (
    <div className="relative bg-emerald-50 border-b border-emerald-200 text-emerald-900 text-center text-sm py-2 pl-4 pr-10">
      <span className="mr-1">🟢</span><b>Radar PRO activo hoy</b>: sellos, filtros, Competencia y Tendencias, solo sábado y domingo.{' '}
      <a href={url} target="_blank" rel="noopener" className="ml-1 inline-block rounded-full bg-emerald-700 px-3 py-0.5 text-xs font-semibold text-white hover:bg-emerald-800 whitespace-nowrap">Entrar al Radar →</a>
      <button type="button" aria-label="Cerrar aviso" title="Cerrar hasta el próximo fin de semana"
        onClick={() => { try { localStorage.setItem(llave, '1') } catch { /* sin almacenamiento */ } setVer(false) }}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-0.5 text-emerald-700 hover:bg-emerald-100">✕</button>
    </div>
  )
}
