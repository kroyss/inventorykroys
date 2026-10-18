'use client'
// Imprimir etiquetas de producto (18-10): elegir productos y copias, tamaño del rollo, y bajar UN PDF
// con una página por etiqueta (lib/etiquetasProducto.ts). Desde Inventario: todos los que tienen stock,
// o uno solo desde su fila.
import { useEffect, useMemo, useState } from 'react'
import type { InventoryItem } from '@/lib/types'
import { TAMANOS, type TamanoEtiqueta } from '@/lib/etiquetasTamanos'

const CLAVE_TAMANO = 'etiquetas_tamano'

export default function EtiquetasModal({ items, soloId, onCerrar }: {
  items: InventoryItem[]
  /** Abierta desde la fila de un producto: arranca con solo ese marcado. */
  soloId?: number | null
  onCerrar: () => void
}) {
  const activos = useMemo(() => items.filter(i => i.is_active).sort((a, b) => a.code.localeCompare(b.code)), [items])
  const [copias, setCopias] = useState<Record<number, number>>(() => {
    const ini: Record<number, number> = {}
    for (const i of activos) if (soloId ? i.product_id === soloId : i.quantity > 0) ini[i.product_id] = 1
    return ini
  })
  const [tamano, setTamano] = useState<TamanoEtiqueta>('50x25')
  const [buscar, setBuscar] = useState('')
  const [generando, setGenerando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    try { const t = localStorage.getItem(CLAVE_TAMANO); if (t === '50x25' || t === '57x32') setTamano(t) } catch { /* sin almacenamiento */ }
  }, [])
  const elegirTamano = (t: TamanoEtiqueta) => {
    setTamano(t)
    try { localStorage.setItem(CLAVE_TAMANO, t) } catch { /* sin almacenamiento */ }
  }

  const q = buscar.trim().toLowerCase()
  const visibles = q ? activos.filter(i => i.code.toLowerCase().includes(q) || i.name.toLowerCase().includes(q)) : activos
  const marcados = activos.filter(i => copias[i.product_id] > 0)
  const total = marcados.reduce((s, i) => s + copias[i.product_id], 0)

  const marcar = (id: number, n: number) => setCopias(c => {
    const nuevo = { ...c }
    if (n > 0) nuevo[id] = Math.min(999, Math.round(n)); else delete nuevo[id]
    return nuevo
  })
  const marcarTodos = (lista: InventoryItem[], n: number) => setCopias(c => {
    const nuevo = { ...c }
    for (const i of lista) { if (n > 0) nuevo[i.product_id] = n; else delete nuevo[i.product_id] }
    return nuevo
  })

  const descargar = async () => {
    if (!total) return
    setGenerando(true); setError(null)
    try {
      // pdf-lib solo se carga al imprimir (no pesa en la pantalla de Inventario).
      const { pdfEtiquetas, descargarPdf } = await import('@/lib/etiquetasProducto')
      const bytes = await pdfEtiquetas(marcados.map(i => ({ code: i.code, name: i.name, copias: copias[i.product_id] })), tamano)
      const hoy = new Date().toLocaleDateString('en-CA')
      descargarPdf(bytes, marcados.length === 1 ? `etiqueta-${marcados[0].code}-${tamano}.pdf` : `etiquetas-${total}-${tamano}-${hoy}.pdf`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo generar el PDF')
    } finally {
      setGenerando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onCerrar} />
      <div className="relative flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl sm:h-[90vh] sm:rounded-xl">
        <div className="flex items-start justify-between gap-3 border-b px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold">🏷 Imprimir etiquetas</h2>
            <p className="text-xs text-neutral-500">Código, nombre de inventario y código de barras. Un PDF con una página por etiqueta, ya a la medida del rollo.</p>
          </div>
          <button onClick={onCerrar} className="text-xl leading-none text-neutral-400 hover:text-neutral-700">×</button>
        </div>

        <div className="space-y-3 border-b px-5 py-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-neutral-500">Tamaño del rollo:</span>
            {(Object.keys(TAMANOS) as TamanoEtiqueta[]).map(t => (
              <button key={t} onClick={() => elegirTamano(t)}
                className={`rounded-full border px-3 py-1 text-xs ${tamano === t ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 text-neutral-700'}`}>
                {TAMANOS[t].nombre}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input type="search" value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar por código o nombre…"
              className="min-w-0 flex-1 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm" />
            <button onClick={() => marcarTodos(activos.filter(i => i.quantity > 0), 1)} className="btn-secondary text-xs">Todos con stock</button>
            <button onClick={() => marcarTodos(visibles, 1)} className="btn-secondary text-xs">{q ? 'Marcar los buscados' : 'Todos'}</button>
            <button onClick={() => setCopias({})} className="text-xs text-neutral-500 underline hover:text-neutral-800">Ninguno</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-neutral-50 text-xs text-neutral-500">
              <tr>
                <th className="w-8 px-3 py-2" />
                <th className="px-2 py-2 text-left">Código</th>
                <th className="px-2 py-2 text-left">Nombre</th>
                <th className="px-2 py-2 text-right">Stock</th>
                <th className="w-24 px-3 py-2 text-right">Etiquetas</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map(i => {
                const n = copias[i.product_id] ?? 0
                return (
                  <tr key={i.product_id} className={`border-t ${n ? 'bg-lime-50/40' : ''}`}>
                    <td className="px-3 py-1.5">
                      <input type="checkbox" checked={n > 0} onChange={e => marcar(i.product_id, e.target.checked ? 1 : 0)} className="h-4 w-4" />
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 font-mono text-xs text-neutral-600">{i.code}</td>
                    <td className="px-2 py-1.5 text-neutral-900">{i.name}</td>
                    <td className="px-2 py-1.5 text-right text-neutral-500 num">{i.quantity}</td>
                    <td className="px-3 py-1.5 text-right">
                      <input type="number" min={0} max={999} value={n || ''} placeholder="0"
                        onChange={e => marcar(i.product_id, Number(e.target.value) || 0)}
                        className="w-16 rounded border border-neutral-300 px-2 py-1 text-right text-sm" />
                    </td>
                  </tr>
                )
              })}
              {!visibles.length && <tr><td colSpan={5} className="px-3 py-8 text-center text-neutral-400">Sin resultados</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="space-y-2 border-t bg-neutral-50 px-5 py-3">
          {error && <p className="text-sm text-red-600">{error}</p>}
          <p className="text-[11px] text-neutral-500">
            Al imprimir el PDF: <b>Escala 100 %</b> (no “Ajustar”), <b>márgenes: ninguno</b> y en la impresora el papel de <b>{TAMANOS[tamano].nombre}</b>.
            Prueba primero con una sola etiqueta.
          </p>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm text-neutral-700">
              <b className="num">{marcados.length}</b> {marcados.length === 1 ? 'producto' : 'productos'} · <b className="num">{total}</b> {total === 1 ? 'etiqueta' : 'etiquetas'}
            </span>
            <div className="flex gap-2">
              <button onClick={onCerrar} className="btn-secondary text-sm">Cerrar</button>
              <button onClick={descargar} disabled={!total || generando} className="btn-primary text-sm">
                {generando ? 'Generando…' : 'Descargar PDF'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
