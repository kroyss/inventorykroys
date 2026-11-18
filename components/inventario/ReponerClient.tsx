'use client'
// Inventario → Reponer (18-11; antes Reportes → Stock, mismo componente y misma API: /api/reports/stock-analysis).
// Viene con los datos en el HTML; «No volver a pedir» / Devolver actualizan por detrás sin pantalla en blanco.
import { useEffect, useState } from 'react'
import { PageHeader, Cargando } from '@/components/ui'
import StockReport, { type StockSub } from '@/components/reportes/StockReport'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Datos = any

export default function ReponerClient({ inicial, subInicial }: { inicial: Datos | null; subInicial: StockSub }) {
  const [data, setData] = useState<Datos | null>(inicial)
  const [sub, setSub] = useState<StockSub>(subInicial)
  const [cargando, setCargando] = useState(!inicial)
  const [error, setError] = useState<string | null>(null)

  const traer = async (enBlanco: boolean) => {
    if (enBlanco) { setCargando(true); setError(null) }
    try {
      const r = await fetch('/api/reports/stock-analysis', { cache: 'no-store' })
      if (!r.ok) throw new Error()
      setData(await r.json())
    } catch { if (enBlanco) setError('No se pudo cargar. Prueba de nuevo.') }
    finally { if (enBlanco) setCargando(false) }
  }
  // Si no vino en el HTML (tardó más de la cuenta), se pide aquí.
  useEffect(() => {
    if (inicial) return
    let vivo = true
    fetch('/api/reports/stock-analysis', { cache: 'no-store' }).then(r => (r.ok ? r.json() : Promise.reject()))
      .then(d => { if (vivo) { setData(d); setCargando(false) } })
      .catch(() => { if (vivo) { setError('No se pudo cargar. Prueba de nuevo.'); setCargando(false) } })
    return () => { vivo = false }
  }, [inicial])

  return (
    <div className="space-y-4">
      <PageHeader title="Reponer" subtitle="Qué comprar según lo que vendes y tus reglas, y la compra lista para crear" />
      {error && <div className="rounded border border-red-200 bg-red-50 px-4 py-2 text-red-700">{error}</div>}
      {cargando && <Cargando />}
      {!cargando && data?.reposicion && (
        <StockReport data={data} sub={sub} setSub={setSub} onReload={() => traer(true)} onRefrescar={() => traer(false)} />
      )}
    </div>
  )
}
