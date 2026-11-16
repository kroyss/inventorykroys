'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from '@/components/ui/Link'
import { Cargando, EmptyState, PageHeader, money } from '@/components/ui'
import { leerNumero } from '@/lib/numeroTexto'

// Productos → Completar costos (mig 180, 16-11-2026). Los importados con "costo estimado", los más vendidos
// primero. Guardar el real corrige solas las ventas hechas con el estimado; "Está bien así" solo quita la marca.

interface Fila {
  id: number; code: string; name: string; costo: number; precio: number
  unidades_30d: number; vendido_30d: number; ventas_estimadas: number
}
interface Datos { productos: Fila[]; pais: 'VE' | 'CO'; trm: number }

export default function CompletarCostosClient() {
  const [datos, setDatos] = useState<Datos | null>(null)
  const [valores, setValores] = useState<Record<number, string>>({})
  const [ocupado, setOcupado] = useState<number | 'todos' | null>(null)
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null)

  const cargar = useCallback(async () => {
    const r = await fetch('/api/products/costos', { cache: 'no-store' })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setAviso({ ok: false, texto: d.error ?? 'No se pudo cargar' }); return }
    setDatos(d)
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const co = datos?.pais === 'CO'
  const plata = (n: number) => co ? `$${Math.round(n).toLocaleString('de-DE')}` : `$${money(n)}`
  const valor = (f: Fila) => valores[f.id] ?? String(f.costo).replace('.', ',')
  const cambiado = (f: Fila) => { const v = leerNumero(valor(f)); return v > 0 && Math.abs(v - f.costo) >= 0.005 }
  const valido = (f: Fila) => leerNumero(valor(f)) > 0
  const pctPrecio = (f: Fila) => {
    const precioUsd = co ? f.precio / (datos?.trm || 1) : f.precio
    const v = leerNumero(valor(f))
    return precioUsd > 0 && v > 0 ? Math.round(v / precioUsd * 100) : null
  }
  const cambiados = useMemo(() => (datos?.productos ?? []).filter(f => cambiado(f) && valido(f)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [datos, valores])
  const totalVendido = (datos?.productos ?? []).reduce((s, f) => s + f.vendido_30d, 0)

  const guardar = async (filas: Fila[], cual: number | 'todos') => {
    if (!filas.length) return
    setOcupado(cual); setAviso(null)
    const r = await fetch('/api/products/costos', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: filas.map(f => ({ product_id: f.id, costo: leerNumero(valor(f)) })) }),
    })
    const d = await r.json().catch(() => ({}))
    setOcupado(null)
    if (!r.ok) { setAviso({ ok: false, texto: d.error ?? 'No se pudo guardar' }); return }
    const n = d.guardados as number
    setAviso({ ok: true, texto: `${n} ${n === 1 ? 'costo guardado' : 'costos guardados'}. Las ventas que usaban el estimado ya están corregidas.` })
    const ids = new Set(filas.map(f => f.id))
    setDatos(x => x && { ...x, productos: x.productos.filter(f => !ids.has(f.id)) })
    setValores(v => Object.fromEntries(Object.entries(v).filter(([k]) => !ids.has(Number(k)))))
  }

  return (
    <div className="space-y-4 pb-20">
      <PageHeader title="Completar costos"
        subtitle="Productos importados con costo estimado. Pon el real y las ventas se corrigen solas."
        actions={<Link href="/productos" className="btn-secondary text-sm">Volver a Productos</Link>} />

      <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-2.5 text-xs leading-relaxed text-amber-900">
        <svg className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>
        <p>
          <b>Empieza por arriba:</b> son los que más vendiste en los últimos 30 días, y con pocos costos reales ya cubres
          casi toda tu ganancia. El costo va en <b>USD</b>. Si el estimado ya es el correcto, toca <b>Está bien así</b>.
        </p>
      </div>

      {aviso && (
        <div className={`rounded-lg border px-3 py-2 text-sm ${aviso.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700'}`}>
          {aviso.texto}
        </div>
      )}

      {!datos ? <Cargando /> : !datos.productos.length ? (
        <div className="rounded-xl border border-neutral-200 bg-white shadow-sm">
          <EmptyState message="Todos tus productos tienen su costo real. Tus ganancias ya son exactas."
            cta={<Link href="/productos" className="btn-primary text-sm">Ir a Productos</Link>} />
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
          <ul className="divide-y divide-neutral-100">
            {datos.productos.map(f => {
              const pct = pctPrecio(f)
              const parte = totalVendido > 0 ? Math.round(f.vendido_30d / totalVendido * 100) : 0
              return (
                <li key={f.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-neutral-900" title={f.name}>{f.name}</p>
                    <p className="mt-0.5 text-[11px] text-neutral-400">
                      {f.code} · precio {plata(f.precio)}
                      {f.unidades_30d > 0
                        ? <> · {f.unidades_30d} u. en 30 días ({plata(f.vendido_30d)}{parte > 0 ? `, ${parte} % de lo vendido` : ''})</>
                        : ' · sin ventas en 30 días'}
                      {f.ventas_estimadas > 0 && <> · <span className="text-amber-700">{f.ventas_estimadas} {f.ventas_estimadas === 1 ? 'venta' : 'ventas'} por corregir</span></>}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <label className="flex items-center gap-1 text-[11px] text-neutral-500">Costo
                      <input value={valor(f)} inputMode="decimal" aria-label={`Costo de ${f.name}`}
                        onChange={e => setValores(v => ({ ...v, [f.id]: e.target.value }))}
                        className={`w-24 rounded-md border px-2 py-1 text-right text-xs num ${!valido(f) ? 'border-red-300 bg-red-50' : cambiado(f) ? 'border-neutral-400' : 'border-amber-300 bg-amber-50/60 text-amber-900'}`} />
                      <span className="text-neutral-400">USD</span>
                    </label>
                    {pct != null && <span className="w-20 text-[11px] text-neutral-400">{pct} % del precio</span>}
                    <button type="button" disabled={!!ocupado || !valido(f)} onClick={() => guardar([f], f.id)}
                      className={`${cambiado(f) ? 'btn-primary' : 'btn-secondary'} w-28 text-xs`}>
                      {ocupado === f.id ? 'Guardando…' : cambiado(f) ? 'Guardar' : 'Está bien así'}
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {cambiados.length > 1 && (
        <div data-barra-fija className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 px-4 md:bottom-4">
          <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-3 shadow-lg">
            <p className="text-sm text-neutral-700"><b>{cambiados.length}</b> costos cambiados</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setValores({})} className="btn-secondary text-sm">Deshacer</button>
              <button type="button" disabled={!!ocupado} onClick={() => guardar(cambiados, 'todos')} className="btn-primary text-sm">
                {ocupado === 'todos' ? 'Guardando…' : `Guardar ${cambiados.length}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
