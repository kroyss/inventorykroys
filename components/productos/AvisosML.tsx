'use client'
// 13-11-2026 (el dueño, mig. 173): dos avisos con el mismo resumen (/api/products/ml-resumen).
//   · SugerenciaInventarioML (Inicio): inventario recién activado sin productos vinculados → empezar desde MercadoLibre.
//   · AvisoNuevasML (Productos): publicaciones nuevas (15 días) sin producto → Vincular con ML.
import { useEffect, useState } from 'react'
import Link from '@/components/ui/Link'

interface Resumen { conectada: boolean; productos: number; vinculados: number; nuevas: number }
const CERRADA = 'sugerencia-inventario-ml-cerrada'

function useResumen() {
  const [r, setR] = useState<Resumen | null>(null)
  useEffect(() => { fetch('/api/products/ml-resumen').then(x => (x.ok ? x.json() : null)).then(setR).catch(() => {}) }, [])
  return r
}

/** Inicio: sugerencia (se puede cerrar) mientras ningún producto esté vinculado con MercadoLibre. */
export function SugerenciaInventarioML() {
  const r = useResumen()
  const [cerrada, setCerrada] = useState(true)
  useEffect(() => { try { setCerrada(localStorage.getItem(CERRADA) === '1') } catch { setCerrada(false) } }, []) // eslint-disable-line react-hooks/set-state-in-effect
  if (!r || cerrada || r.vinculados > 0) return null
  const cerrar = () => { setCerrada(true); try { localStorage.setItem(CERRADA, '1') } catch { /* sin almacenamiento */ } }
  return (
    <div className="relative rounded-xl border border-lime-300 bg-lime-50 p-4 pr-10 sm:flex sm:items-center sm:gap-6">
      <button onClick={cerrar} className="absolute right-2 top-2 rounded p-1 text-neutral-400 hover:text-neutral-700" aria-label="Cerrar sugerencia">✕</button>
      <div className="flex-1">
        <div className="font-semibold text-neutral-900">Empieza tu inventario desde MercadoLibre</div>
        <p className="mt-1 text-sm text-neutral-600">
          {r.conectada
            ? 'Crea tus productos a partir de tus publicaciones: cada una (o cada color/modelo) queda como un producto ya vinculado, y las ventas de ML descuentan el stock solas.'
            : 'Conecta tu cuenta de MercadoLibre y crea tus productos a partir de tus publicaciones: así el inventario arranca ordenado y las ventas descuentan el stock solas.'}
        </p>
      </div>
      <Link href={r.conectada ? '/productos/importar-ml' : '/cuentas-ml'} className="btn-primary mt-3 inline-block whitespace-nowrap text-sm sm:mt-0">
        {r.conectada ? 'Crear productos desde mis publicaciones' : 'Conectar MercadoLibre'}
      </Link>
    </div>
  )
}

/** Productos: publicaciones nuevas sin producto. */
export function AvisoNuevasML() {
  const r = useResumen()
  if (!r?.nuevas) return null
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <span className="text-sky-900"><b>{r.nuevas} publicaci{r.nuevas === 1 ? 'ón nueva' : 'ones nuevas'}</b> en MercadoLibre sin producto en el inventario.</span>
      <Link href="/vincular-ml?vista=nuevas" className="btn-primary shrink-0 text-center text-xs">Vincular o crear</Link>
    </div>
  )
}
