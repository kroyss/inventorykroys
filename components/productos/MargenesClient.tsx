'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Product, ProfitCategory } from '@/lib/types'
import { KPICard, exportRows } from '@/components/ui'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import { matchTokens } from '@/lib/search'
import { shipInfo, parseShippingTable, type ShipTier } from '@/lib/mlShipping'
import {
  liveFinalVE, livePublishedVE, globalDiscountVE, mlNetFor, storedPricesVE, type VeRate,
} from '@/lib/pricingVE'

// Revisión de márgenes de productos baratos (VE).
//
// Con la tabla de MercadoEnvíos de octubre 2026 el envío gratis empieza en $3 para
// productos livianos: por debajo de $5 el costo de envío pasa a pesar más sobre el
// precio (hasta 21,7% del precio, antes 13%). Esta vista lista los productos con
// precio final < $5, compara su ganancia con la regla anterior y sugiere el MENOR
// escalón de categoría que devuelve la ganancia POR UNIDAD (en dólares) que tenían.
// Se apunta a los dólares y no al %: con un precio más alto, la misma ganancia es
// un % menor, y perseguir el % pediría subir más de lo necesario.
// Aplicar deja la categoría y los precios guardados al día en un solo paso.

const LIMITE = 5    // precio final por debajo del cual el cambio de envío pesa
const SANO   = 20   // margen sobre venta sano (mismo corte que la ficha de producto)

const fmt = (n: number) => Number(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const pct = (n: number | null) => (n == null ? '—' : `${n >= 0 ? '' : '−'}${Math.abs(n).toFixed(1)}%`)
const margenCls = (m: number | null) =>
  m == null ? 'text-neutral-400' : m >= SANO ? 'text-green-600' : m >= 0 ? 'text-amber-600' : 'text-red-600'

interface Eval { eff: number; final: number; publicado: number; margen: number | null; ganancia: number | null }
interface Row {
  p: Product
  now: Eval
  margenAntes: number | null
  gananciaAntes: number | null
  sugerida: ProfitCategory | null
}

export default function MargenesClient({ initialProducts, categories }: {
  initialProducts: Product[]
  categories: ProfitCategory[]   // ordenadas por % ascendente
}) {
  const router  = useRouter()
  const confirm = useConfirm()

  const [veRate,   setVeRate]   = useState<VeRate | null>(null)
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [loaded,   setLoaded]   = useState(false)
  useEffect(() => {
    Promise.all([
      fetch('/api/rates/latest').then(r => r.json()).catch(() => null),
      fetch('/api/settings').then(r => r.json()).catch(() => ({})),
    ]).then(([r, s]) => {
      if (r && r.official_rate) setVeRate({ official: r.official_rate, parallel: r.parallel_rate, excess: r.excess_percentage })
      setSettings(s && typeof s === 'object' ? s : {})
      setLoaded(true)
    })
  }, [])

  const shipTable      = useMemo(() => parseShippingTable(settings.ml_shipping_table), [settings.ml_shipping_table])
  const globalDiscount = globalDiscountVE(settings, veRate)
  const excess         = veRate?.excess ?? 0

  // Precio, descuento efectivo y margen de un producto SI tuviera la categoría `profitPct`.
  // El descuento se recalcula porque el tope de envío gratis depende del precio publicado.
  const evalAt = useMemo(() => (p: Product, profitPct: number, table: ShipTier[] = shipTable,
                                ml: Record<string, string> = settings): Eval => {
    const q = { ...p, profit_percentage: profitPct }
    const publicado = livePublishedVE(q, excess)
    const eff   = shipInfo(p.weight_kg, publicado, globalDiscount, shipTable).effectiveDiscount
    const final = liveFinalVE(q, excess, eff)
    const net   = mlNetFor('VE', q, veRate, 0, ml, eff, table)
    return { eff, final, publicado, margen: net?.margen ?? null, ganancia: net?.ganancia ?? null }
  }, [excess, globalDiscount, shipTable, settings, veRate])

  const rows: Row[] = useMemo(() => {
    if (!veRate) return []
    // Regla anterior: un único mínimo de $5 para todo el catálogo. Tabla vacía →
    // el envío cae al umbral global, que se fuerza en 5.
    const antesMl = { ...settings, ml_umbral: '5' }
    const out: Row[] = []
    for (const p of initialProducts) {
      const now = evalAt(p, p.profit_percentage)
      if (!(now.final > 0) || now.final >= LIMITE) continue
      const antes = evalAt(p, p.profit_percentage, [], antesMl)

      // Solo se sugiere subir si perdió ganancia con el envío nuevo Y no quedó sano.
      // Los que siguen con 20% o más se dejan: el envío gratis a una unidad les
      // juega a favor en ventas.
      let sugerida: ProfitCategory | null = null
      const perdio = now.ganancia != null && antes.ganancia != null && now.ganancia < antes.ganancia - 0.005
      if (perdio && now.margen != null && now.margen < SANO) {
        for (const c of categories) {
          if (c.profit_percentage <= p.profit_percentage) continue
          sugerida = c
          const g = evalAt(p, c.profit_percentage).ganancia
          if (g != null && g >= antes.ganancia!) break   // menor escalón que devuelve los dólares
        }
      }
      out.push({ p, now, margenAntes: antes.margen, gananciaAntes: antes.ganancia, sugerida })
    }
    return out.sort((a, b) => (a.now.margen ?? -999) - (b.now.margen ?? -999))
  }, [initialProducts, categories, evalAt, veRate, settings])

  // Categoría elegida por fila y selección. Arranca con la sugerencia.
  const [choice,  setChoice]  = useState<Record<number, number>>({})
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [iniciado, setIniciado] = useState(false)
  useEffect(() => {
    if (iniciado || rows.length === 0) return
    const c: Record<number, number> = {}
    const s = new Set<number>()
    for (const r of rows) if (r.sugerida) { c[r.p.id] = r.sugerida.id; s.add(r.p.id) }
    setChoice(c); setChecked(s); setIniciado(true)
  }, [rows, iniciado])

  const [soloSugeridos, setSoloSugeridos] = useState(true)
  const [search, setSearch] = useState('')
  const visibles = rows.filter(r =>
    (!soloSugeridos || r.sugerida || choice[r.p.id] != null) &&
    (!search || matchTokens(search, r.p.code, r.p.name, r.p.category_name ?? '')))

  const catById = (id: number | null | undefined) => categories.find(c => c.id === id) ?? null
  const destino = (r: Row) => catById(choice[r.p.id]) ?? catById(r.p.profit_category_id)
  const cambia  = (r: Row) => {
    const d = destino(r)
    return !!d && d.id !== r.p.profit_category_id && checked.has(r.p.id)
  }
  const aplicar = rows.filter(cambia)

  const kpi = {
    total:    rows.length,
    perdieron: rows.filter(r => r.now.ganancia != null && r.gananciaAntes != null && r.now.ganancia < r.gananciaAntes - 0.005).length,
    rojo:     rows.filter(r => r.now.margen != null && r.now.margen < 8).length,
    sugeridos: rows.filter(r => r.sugerida).length,
  }

  const plan = () => aplicar.map(r => {
    const d = destino(r)!
    const nuevo = evalAt(r.p, d.profit_percentage)
    return {
      'Código':            r.p.code,
      'Producto':          r.p.name,
      'Categoría actual':  r.p.category_name ?? '',
      'Categoría nueva':   d.name,
      'Lista ML actual':   Math.round(r.now.publicado * 100) / 100,
      'Lista ML nueva':    Math.round(nuevo.publicado * 100) / 100,
      'Descuento %':       Math.round(nuevo.eff * 10) / 10,
      'Final actual':      Math.round(r.now.final * 100) / 100,
      'Final nuevo':       Math.round(nuevo.final * 100) / 100,
      'Margen antes %':    r.margenAntes == null ? '' : Math.round(r.margenAntes * 10) / 10,
      'Margen ahora %':    r.now.margen == null ? '' : Math.round(r.now.margen * 10) / 10,
      'Margen nuevo %':    nuevo.margen == null ? '' : Math.round(nuevo.margen * 10) / 10,
      'Ganancia/u antes':  r.gananciaAntes == null ? '' : Math.round(r.gananciaAntes * 100) / 100,
      'Ganancia/u ahora':  r.now.ganancia == null ? '' : Math.round(r.now.ganancia * 100) / 100,
      'Ganancia/u nueva':  nuevo.ganancia == null ? '' : Math.round(nuevo.ganancia * 100) / 100,
    }
  })

  const [busy, setBusy] = useState(false)
  const [msg,  setMsg]  = useState<{ ok: boolean; text: string } | null>(null)

  async function onAplicar() {
    if (!veRate || aplicar.length === 0) return
    const ok = await confirm({
      title: 'Aplicar cambios de categoría',
      message: `Se cambia la categoría de ${aplicar.length} producto(s) y se actualizan sus precios guardados en el sistema. Los precios en MercadoLibre hay que actualizarlos a mano (exportá el Excel antes).`,
      confirmText: 'Aplicar',
    })
    if (!ok) return
    setBusy(true); setMsg(null)
    const items = aplicar.map(r => {
      const d = destino(r)!
      const e = evalAt(r.p, d.profit_percentage)
      return {
        product_id: r.p.id,
        profit_category_id: d.id,
        ...storedPricesVE(r.p.total_cost, d.profit_percentage, excess, e.eff, veRate.official),
      }
    })
    const res = await fetch('/api/products/reprice', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items }),
    })
    setBusy(false)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setMsg({ ok: false, text: d.error ?? 'Error al aplicar' }); return
    }
    setMsg({ ok: true, text: `Listo: ${items.length} producto(s) actualizados. Acordate de cambiar el precio de lista en MercadoLibre.` })
    setChoice({}); setChecked(new Set()); setIniciado(false)
    router.refresh()
  }

  const toggle = (id: number) => setChecked(s => {
    const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n
  })

  if (loaded && !veRate) {
    return <p className="text-sm text-red-600">No hay tasa cargada: sin oficial y paralelo no se puede calcular el margen real.</p>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold">Revisión de márgenes · productos de menos de $5</h1>
          <p className="text-xs text-neutral-500">
            Compara el margen con la regla de envío anterior (gratis desde $5 fijo) contra la tabla de
            MercadoEnvíos vigente, por peso. Sugiere el menor escalón de categoría que devuelve la ganancia por
            unidad (en dólares) que tenía.
          </p>
        </div>
        <Link href="/productos" className="text-sm text-neutral-700 underline underline-offset-2 hover:text-neutral-900">← Productos</Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard compact label="Productos < $5" value={kpi.total} />
        <KPICard compact label="Perdieron margen" value={kpi.perdieron} accent={kpi.perdieron ? 'text-amber-600' : undefined} />
        <KPICard compact label="Margen < 8%" value={kpi.rojo} accent={kpi.rojo ? 'text-red-600' : undefined} />
        <KPICard compact label="Con sugerencia de subir" value={kpi.sugeridos} />
      </div>

      <div className="text-xs bg-neutral-50 border border-neutral-200 text-neutral-700 rounded-lg px-3 py-2 leading-relaxed">
        Los que siguen con <b>20% o más</b> no tienen sugerencia a propósito: con el mínimo en $3, tienen envío
        gratis comprando una sola unidad y eso vende más. Podés elegir otra categoría en cualquier fila.
        Sin peso registrado, el envío usa el umbral global de Ajustes.
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar…"
          className="border border-neutral-300 rounded-lg px-3 py-1.5 text-sm w-56" />
        <label className="flex items-center gap-1.5 text-sm text-neutral-600">
          <input type="checkbox" checked={soloSugeridos} onChange={e => setSoloSugeridos(e.target.checked)} />
          Solo con sugerencia
        </label>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => exportRows(`plan_margenes_${new Date().toISOString().slice(0, 10)}`, plan(), 'Plan')}
            disabled={aplicar.length === 0}
            className="px-3 py-1.5 text-sm border border-neutral-300 rounded-lg hover:bg-neutral-100 disabled:opacity-40">
            ↓ Excel para ML ({aplicar.length})
          </button>
          <button onClick={onAplicar} disabled={busy || aplicar.length === 0}
            className="px-3 py-1.5 text-sm bg-neutral-900 text-white rounded-lg hover:bg-neutral-700 disabled:opacity-40">
            {busy ? 'Aplicando…' : `Aplicar ${aplicar.length} cambio(s)`}
          </button>
        </div>
      </div>

      {msg && (
        <p className={`text-sm ${msg.ok ? 'text-green-700' : 'text-red-600'}`}>{msg.text}</p>
      )}

      <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-xs text-neutral-500">
            <tr>
              <th className="px-2 py-2"></th>
              <th className="px-2 py-2 text-left">Producto</th>
              <th className="px-2 py-2 text-right">Peso</th>
              <th className="px-2 py-2 text-right">Final</th>
              <th className="px-2 py-2 text-right" title="Ganancia por unidad con la regla anterior → con la tabla vigente">Ganancia/u antes → ahora</th>
              <th className="px-2 py-2 text-right" title="Margen sobre venta con la regla anterior → con la tabla vigente">Margen antes → ahora</th>
              <th className="px-2 py-2 text-left">Categoría</th>
              <th className="px-2 py-2 text-right" title="Precio de lista a cargar en MercadoLibre">Lista ML nueva</th>
              <th className="px-2 py-2 text-right">Final nuevo</th>
              <th className="px-2 py-2 text-right">Ganancia/u nueva</th>
              <th className="px-2 py-2 text-right">Margen nuevo</th>
            </tr>
          </thead>
          <tbody>
            {!loaded && (
              <tr><td colSpan={11} className="px-3 py-6 text-center text-neutral-400">Calculando…</td></tr>
            )}
            {loaded && visibles.length === 0 && (
              <tr><td colSpan={11} className="px-3 py-6 text-center text-neutral-400">Sin productos para revisar</td></tr>
            )}
            {visibles.map(r => {
              const d = destino(r)
              const nuevo = d && d.id !== r.p.profit_category_id ? evalAt(r.p, d.profit_percentage) : null
              return (
                <tr key={r.p.id} className="border-t border-neutral-100">
                  <td className="px-2 py-1.5">
                    <input type="checkbox" checked={checked.has(r.p.id)} onChange={() => toggle(r.p.id)}
                      disabled={!nuevo} />
                  </td>
                  <td className="px-2 py-1.5">
                    <span className="font-mono text-xs text-neutral-400 mr-1.5">{r.p.code}</span>{r.p.name}
                  </td>
                  <td className="px-2 py-1.5 text-right text-xs text-neutral-500">
                    {r.p.weight_kg != null ? `${r.p.weight_kg} kg` : <span title="Sin peso: usa el umbral global">—</span>}
                  </td>
                  <td className="px-2 py-1.5 text-right">${fmt(r.now.final)}</td>
                  <td className="px-2 py-1.5 text-right whitespace-nowrap">
                    {r.gananciaAntes != null ? `$${fmt(r.gananciaAntes)}` : '—'}
                    <span className="text-neutral-300 mx-1">→</span>
                    <span className="font-semibold">{r.now.ganancia != null ? `$${fmt(r.now.ganancia)}` : '—'}</span>
                  </td>
                  <td className="px-2 py-1.5 text-right whitespace-nowrap">
                    <span className={margenCls(r.margenAntes)}>{pct(r.margenAntes)}</span>
                    <span className="text-neutral-300 mx-1">→</span>
                    <span className={`font-semibold ${margenCls(r.now.margen)}`}>{pct(r.now.margen)}</span>
                  </td>
                  <td className="px-2 py-1.5">
                    <select
                      value={d?.id ?? ''}
                      onChange={e => {
                        const id = Number(e.target.value)
                        setChoice(c => ({ ...c, [r.p.id]: id }))
                        setChecked(s => { const n = new Set(s); if (id !== r.p.profit_category_id) n.add(r.p.id); else n.delete(r.p.id); return n })
                      }}
                      className="border border-neutral-300 rounded px-1.5 py-1 text-xs bg-white">
                      {categories.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.profit_percentage}%){c.id === r.p.profit_category_id ? ' · actual' : ''}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-1.5 text-right">{nuevo ? `$${fmt(nuevo.publicado)}` : <span className="text-neutral-300">—</span>}</td>
                  <td className="px-2 py-1.5 text-right">{nuevo ? `$${fmt(nuevo.final)}` : <span className="text-neutral-300">—</span>}</td>
                  <td className="px-2 py-1.5 text-right">
                    {nuevo && nuevo.ganancia != null ? `$${fmt(nuevo.ganancia)}` : <span className="text-neutral-300">—</span>}
                  </td>
                  <td className={`px-2 py-1.5 text-right font-semibold ${margenCls(nuevo?.margen ?? null)}`}>
                    {nuevo ? pct(nuevo.margen) : <span className="text-neutral-300 font-normal">—</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
