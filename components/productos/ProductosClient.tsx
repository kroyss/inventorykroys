'use client'
import { useState, useCallback, useEffect, useMemo, type ReactNode } from 'react'
import type { Product, ProfitCategory, Country, MLCode } from '@/lib/types'
import { int } from '@/components/ui'
import { useEscape } from '@/components/ui/useEscape'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import { matchTokens } from '@/lib/search'
import MlBreakdown from './MlBreakdown'

// ─── helpers ────────────────────────────────────────────────────
const ML_ACCOUNTS: Record<Country, string[]> = {
  VE: ['PIKEKE', 'SOLUCION-MC'],
  CO: ['KROYS', 'VAPERK'],
}

function fmt(n: number) {
  return Number(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
// Pesos colombianos: sin decimales (ej. 140.700)
function fmtPeso(n: number) {
  return Number(n).toLocaleString('de-DE', { maximumFractionDigits: 0 })
}

interface VeRate { official: number; parallel: number; excess: number }

// Cálculo de precios — paridad con el legacy.
//  Precio base    = costo total × (1 + ganancia%)          (markup sobre costo)
//  Precio sug. ML = precio base × (1 + exceso%)            (lo que publicas en VE)
//  Precio final   = publicado × (1 − descuento%)
//  Recibes (par.) = (final × oficial) ÷ paralelo           (al cambiar Bs a paralelo)
function calcPrices(
  baseCost: number, shippingCost: number, profitPct: number,
  rate: VeRate | null, publishedOverride: number | undefined, discountPct = 0,
) {
  const totalCost     = baseCost + shippingCost
  const basePriceUsd  = totalCost * (1 + profitPct / 100)
  const excessPct     = rate?.excess ?? 0
  const suggestedMl   = basePriceUsd * (1 + excessPct / 100)
  const publishedPriceUsd = publishedOverride ?? suggestedMl
  const finalPriceUsd = publishedPriceUsd * (1 - discountPct / 100)

  // VE (hay tasa con paralelo > oficial): descuento recomendado, USD real y margen
  let recDiscount = 0, realUsd = finalPriceUsd, marginPct = 0
  if (rate && rate.parallel > rate.official && rate.official > 0 && publishedPriceUsd > 0) {
    recDiscount = Math.max(0, (1 - (basePriceUsd * 1.05 * rate.parallel) / (publishedPriceUsd * rate.official)) * 100)
    realUsd     = (finalPriceUsd * rate.official) / rate.parallel
    marginPct   = basePriceUsd > 0 ? (realUsd - basePriceUsd) / basePriceUsd * 100 : 0
  }
  return { totalCost, basePriceUsd, suggestedMl, publishedPriceUsd, finalPriceUsd, recDiscount, realUsd, marginPct, excessPct }
}

// Margen NETO real por producto (después de comisiones de ML), por país.
// Reusa las mismas fórmulas que el simulador de Ajustes y la calculadora:
//   VE: ingreso real = precio final llevado a paralelo; − comisión % − envío (con prorrateo bajo el umbral).
//   CO: ingreso = precio de venta en pesos; − comisión % − envío por umbral − retención.
// margen = ganancia ÷ ingreso real (SOBRE VENTA), consistente en ambos países. null si falta dato.
// Precio final VE calculado EN VIVO desde el costo y la config actual (categoría → base,
// exceso, descuento), para que catálogo, vista y calculadora coincidan. El final_price_usd
// guardado queda viejo cuando cambia el exceso/costo y no se re-guarda el producto.
function liveBaseVE(p: { total_cost: number; profit_percentage: number }): number {
  return p.total_cost * (1 + (p.profit_percentage ?? 0) / 100)
}
function liveFinalVE(p: { total_cost: number; profit_percentage: number; discount_percent: number }, excess: number): number {
  return liveBaseVE(p) * (1 + excess / 100) * (1 - (p.discount_percent ?? 0) / 100)
}
// Precio publicado en ML = base × (1 + exceso), antes del descuento.
function livePublishedVE(p: { total_cost: number; profit_percentage: number }, excess: number): number {
  return liveBaseVE(p) * (1 + excess / 100)
}

function mlNetFor(
  country: Country,
  p: { total_cost: number; profit_percentage: number; discount_percent: number; sale_price: number },
  veRate: VeRate | null, coTrm: number, ml: Record<string, string>,
): { ganancia: number; margen: number; pesos: boolean } | null {
  const num = (k: string, d: number) => { const v = parseFloat(ml[k]); return isNaN(v) ? d : v }
  if (country === 'CO') {
    const price = p.sale_price
    if (!(price > 0) || !(coTrm > 0) || !(p.total_cost > 0)) return null
    const comision = price * num('ml_comision', 15.5) / 100
    const envio    = price >= num('ml_umbral_envio', 60000) ? num('ml_envio_alto', 8000) : num('ml_envio_bajo', 2600)
    const reten    = price * num('ml_reten', 1.91) / 100
    const ganancia = (price - comision - envio - reten) - p.total_cost * coTrm
    return { ganancia, margen: ganancia / price * 100, pesos: true }
  }
  // VE: precio publicado calculado EN VIVO (base × exceso actual × (1−descuento)), igual que
  // la calculadora — así no se desincroniza con el final_price_usd guardado (que queda viejo
  // cuando cambia el exceso o no se re-guardó el producto).
  if (!veRate || !(veRate.parallel > 0) || !(veRate.official > 0)) return null
  const finalLive = liveFinalVE(p, veRate.excess ?? 0)
  if (!(finalLive > 0)) return null
  const realUsd  = finalLive * veRate.official / veRate.parallel
  const envio    = num('ml_envio', 0.65) * Math.min(1, finalLive / num('ml_umbral', 5))
  const neto     = realUsd * (1 - num('ml_comision', 12) / 100) - envio
  const ganancia = neto - p.total_cost
  return { ganancia, margen: ganancia / realUsd * 100, pesos: false }
}

// Color del margen neto sobre venta: sano ≥20%, ajustado ≥8%, riesgo/pérdida abajo.
const netColor = (m: number) => m >= 20 ? 'text-green-600' : m >= 8 ? 'text-amber-600' : 'text-red-600'

// ─── types ──────────────────────────────────────────────────────
interface FormState {
  code: string
  name: string
  profit_category_id: number | null
  base_cost: number
  shipping_cost: number
  published_price_usd: number
  discount_percent: number
  sale_price: number
  ml_codes: MLCode[]
}

const emptyForm = (mlAccounts: string[]): FormState => ({
  code: '',
  name: '',
  profit_category_id: null,
  base_cost: 0,
  shipping_cost: 0,
  published_price_usd: 0,
  discount_percent: 0,
  sale_price: 0,
  ml_codes: mlAccounts.map(a => ({ account: a, code: '' })),
})

// Detalle completo de un producto (respuesta de GET /api/products/[id])
interface ProductDetail {
  id: number
  code: string
  name: string
  is_active: boolean
  base_cost: number
  shipping_cost: number
  total_cost: number
  base_price_usd: number
  published_price_usd: number
  final_price_usd: number
  price_bolivares: number
  discount_percent: number
  category_name: string | null
  profit_percentage: number
  profit_category_id: number | null
  sale_price: number
  quantity: number
  ml_codes: MLCode[]
}

// ─── component ──────────────────────────────────────────────────
interface Props {
  initialProducts:  Product[]
  profitCategories: ProfitCategory[]
  country:          Country
}

export default function ProductosClient({ initialProducts, profitCategories, country }: Props) {
  const [products,  setProducts]  = useState<Product[]>(initialProducts)
  const [search,    setSearch]    = useState('')
  const [selected,  setSelected]  = useState<number[]>([])
  const [batchCat,  setBatchCat]  = useState<number | null>(null)
  const [modal,     setModal]     = useState<'create' | 'edit' | null>(null)
  const [editId,    setEditId]    = useState<number | null>(null)
  const [form,      setForm]      = useState<FormState>(emptyForm(ML_ACCOUNTS[country]))
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState('')
  const [okMsg,     setOkMsg]     = useState('')
  const [mounted,   setMounted]   = useState(false)

  // Vista de lectura (slide-over de solo lectura al clickear una fila)
  const [viewing,     setViewing]     = useState<ProductDetail | null>(null)
  const [viewMounted, setViewMounted] = useState(false)

  const mlAccounts = ML_ACCOUNTS[country]
  const confirm = useConfirm()

  // Tasa VE (para exceso/descuento sugerido). Solo aplica en VE.
  const [veRate, setVeRate] = useState<VeRate | null>(null)
  useEffect(() => {
    if (country !== 'VE') return
    fetch('/api/rates/latest').then(r => r.json()).then(d => {
      setVeRate({ official: d.official_rate, parallel: d.parallel_rate, excess: d.excess_percentage })
    }).catch(() => {})
  }, [country])

  // Tasa TRM (CO): para sugerir el precio de venta en pesos a partir del costo USD.
  const [coTrm, setCoTrm] = useState(0)
  useEffect(() => {
    if (country !== 'CO') return
    fetch('/api/rates/co/latest').then(r => r.json()).then(d => {
      setCoTrm(Number(d.trm_rate) || 0)
    }).catch(() => {})
  }, [country])

  // Parámetros de costos ML (Ajustes) para la ganancia neta.
  const [mlSettings, setMlSettings] = useState<Record<string, string>>({})
  useEffect(() => {
    fetch('/api/settings').then(r => r.json())
      .then(d => setMlSettings(d && typeof d === 'object' ? d : {})).catch(() => {})
  }, [])

  // derived calculator values
  const selectedCat = profitCategories.find(c => c.id === form.profit_category_id)
  const profitPct   = selectedCat?.profit_percentage ?? 0
  const {
    totalCost, basePriceUsd, suggestedMl, publishedPriceUsd, finalPriceUsd,
    recDiscount,
  } = calcPrices(
    // publicado = derivado del precio sugerido ML (no input suelto), igual que legacy
    form.base_cost, form.shipping_cost, profitPct, veRate, undefined, form.discount_percent
  )
  const spread  = veRate && veRate.official > 0 ? (veRate.parallel - veRate.official) / veRate.official * 100 : 0
  const priceBs = finalPriceUsd * (veRate?.official ?? 0)
  // CO: precio de venta sugerido en pesos = precio base (USD) × TRM
  const suggestedPesos = Math.round(basePriceUsd * coTrm)

  // Open create modal when arriving via command palette (/productos?new=1)
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('new') === '1') openCreate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // slide-over mount/unmount animation
  useEffect(() => { if (modal) setMounted(true) }, [modal])
  const closeModal = () => { setMounted(false); setTimeout(() => setModal(null), 180) }

  // Esc closes the slide-over
  useEscape(!!modal, closeModal)

  // ── vista de lectura ──
  useEffect(() => { if (viewing) setViewMounted(true) }, [viewing])
  const closeView = () => { setViewMounted(false); setTimeout(() => setViewing(null), 180) }
  useEscape(!!viewing && !modal, closeView)

  async function openView(id: number) {
    const res  = await fetch(`/api/products/${id}`)
    if (!res.ok) return
    setViewing(await res.json())
  }

  // ── open create modal ──
  async function openCreate() {
    setError('')
    const res  = await fetch('/api/products/next-code')
    const data = await res.json()
    setForm({ ...emptyForm(mlAccounts), code: data.next_code ?? data.code })
    setEditId(null)
    setModal('create')
  }

  // ── open edit modal ──
  async function openEdit(id: number) {
    setError('')
    const res  = await fetch(`/api/products/${id}`)
    const data = await res.json()
    setForm({
      code:               data.code,
      name:               data.name,
      profit_category_id: data.profit_category_id ?? null,
      base_cost:          data.base_cost,
      shipping_cost:      data.shipping_cost,
      published_price_usd:data.published_price_usd,
      discount_percent:   data.discount_percent,
      sale_price:         data.sale_price,
      ml_codes:           mlAccounts.map(a => ({
        account: a,
        code: (data.ml_codes as MLCode[]).find(m => m.account === a)?.code ?? '',
      })),
    })
    setEditId(id)
    setModal('edit')
  }

  // ── save (create or update) ──
  const handleSave = useCallback(async (keepOpen = false) => {
    setSaving(true)
    setError(''); setOkMsg('')
    try {
      // CO (híbrido): costo en USD, precio de venta en PESOS (sale_price); los
      // campos *_usd no se usan en CO → 0. VE: calculadora USD como siempre.
      const isCO = country === 'CO'
      const payload = {
        ...form,
        base_price_usd:      isCO ? 0 : basePriceUsd,
        published_price_usd: isCO ? 0 : publishedPriceUsd,
        final_price_usd:     isCO ? 0 : finalPriceUsd,
        discount_percent:    isCO ? 0 : form.discount_percent,
        // VE: el precio de inventario sigue al Precio Base (USD). CO: pesos del input.
        sale_price:          isCO ? form.sale_price : basePriceUsd,
      }

      let res: Response
      if (modal === 'create') {
        res = await fetch('/api/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      } else {
        res = await fetch(`/api/products/${editId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name:               form.name,
            profit_category_id: form.profit_category_id,
            base_cost:          form.base_cost,
            shipping_cost:      form.shipping_cost,
            base_price_usd:     isCO ? 0 : basePriceUsd,
            published_price_usd:isCO ? 0 : publishedPriceUsd,
            final_price_usd:    isCO ? 0 : finalPriceUsd,
            discount_percent:   isCO ? 0 : form.discount_percent,
            sale_price:         isCO ? form.sale_price : basePriceUsd,
            ml_codes:           form.ml_codes.filter(m => m.code.trim()),
          }),
        })
      }

      if (!res.ok) {
        const d = await res.json()
        setError(d.error ?? 'Error al guardar')
        return
      }

      // refresh product list
      const listRes = await fetch('/api/products')
      setProducts(await listRes.json())

      if (keepOpen && modal === 'create') {
        const created = form.code
        // reset form + fetch next code for the following product
        const codeRes = await fetch('/api/products/next-code')
        const codeData = await codeRes.json()
        setForm({ ...emptyForm(mlAccounts), code: codeData.next_code ?? codeData.code })
        setOkMsg(`Producto ${created} creado. Listo para el siguiente.`)
        setTimeout(() => setOkMsg(''), 3000)
      } else {
        closeModal()
      }
    } finally {
      setSaving(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, modal, editId, basePriceUsd, publishedPriceUsd, finalPriceUsd, mlAccounts])

  // ── status toggle / delete ──
  async function handleStatus(id: number, action: 'activate' | 'deactivate' | 'delete'): Promise<boolean> {
    if (action === 'delete' && !await confirm({ title: 'Eliminar producto', message: 'Se eliminará permanentemente este producto. Esta acción no se puede deshacer.', confirmText: 'Eliminar', danger: true })) return false
    const res = await fetch(`/api/products/${id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
    if (!res.ok) {
      const d = await res.json()
      alert(d.error ?? 'Error')
      return false
    }
    const listRes = await fetch('/api/products')
    setProducts(await listRes.json())
    return true
  }

  // ── batch category ──
  async function handleBatch() {
    if (!batchCat || selected.length === 0) return
    const res = await fetch('/api/products/batch-category', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_ids: selected, profit_category_id: batchCat }),
    })
    if (!res.ok) { alert('Error al actualizar categorías'); return }
    const listRes = await fetch('/api/products')
    setProducts(await listRes.json())
    setSelected([])
    setBatchCat(null)
  }

  function toggleSelect(id: number) {
    setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])
  }

  function toggleAll(ids: number[]) {
    setSelected(s => s.length === ids.length ? [] : ids)
  }

  // ── filtered + sorted list with client-side pagination ──
  const PAGE_SIZE = 100
  const [visible, setVisible] = useState(PAGE_SIZE)

  type SortKey = 'code' | 'name' | 'category' | 'cost' | 'price' | 'mlprice' | 'margin' | 'stock' | 'status'
  const [sortKey, setSortKey] = useState<SortKey | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(k); setSortDir('asc') }
  }
  const sortArrow = (k: SortKey) =>
    sortKey === k ? <span className="ml-1">{sortDir === 'asc' ? '▲' : '▼'}</span> : null

  const filtered = useMemo(() => products.filter(p =>
    matchTokens(search, p.code, p.name, p.category_name ?? '')
  ), [products, search])

  const sorted = useMemo(() => {
    if (!sortKey) return filtered
    const margin = (p: Product) => mlNetFor(country, p, veRate, coTrm, mlSettings)?.margen ?? -Infinity
    const valueFor = (p: Product): number | string => {
      switch (sortKey) {
        case 'code':     return p.code
        case 'name':     return p.name.toLowerCase()
        case 'category': return p.category_name ?? '￿'
        case 'cost':     return p.total_cost
        case 'price':    return country === 'CO' ? p.sale_price : liveBaseVE(p)
        case 'mlprice':  return livePublishedVE(p, veRate?.excess ?? 0)
        case 'margin':   return margin(p)
        case 'stock':    return p.quantity
        case 'status':   return p.is_active ? 0 : 1
      }
    }
    const arr = [...filtered].sort((a, b) => {
      const va = valueFor(a), vb = valueFor(b)
      if (typeof va === 'number' && typeof vb === 'number') return va - vb
      return String(va).localeCompare(String(vb))
    })
    return sortDir === 'desc' ? arr.reverse() : arr
  }, [filtered, sortKey, sortDir, country, veRate, coTrm, mlSettings])

  const isSearching = search.trim().length > 0
  const displayed   = isSearching ? sorted : sorted.slice(0, visible)
  const hasMore     = !isSearching && sorted.length > visible
  const filteredIds = sorted.map(p => p.id)

  // ── catalog KPIs ──
  const kpis = {
    total:       products.length,
    activos:     products.filter(p => p.is_active).length,
    inactivos:   products.filter(p => !p.is_active).length,
    sinCat:      products.filter(p => p.is_active && !p.profit_category_id).length,
    valor:       products.filter(p => p.is_active).reduce((s, p) => s + p.quantity * p.total_cost, 0),
  }

  return (
    <div className="space-y-4">
      {/* KPI header */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {([
          { label: 'Productos',     value: int(kpis.total),     accent: 'text-neutral-900' },
          { label: 'Activos',       value: int(kpis.activos),   accent: 'text-green-600' },
          { label: 'Inactivos',     value: int(kpis.inactivos), accent: kpis.inactivos > 0 ? 'text-neutral-400' : 'text-neutral-900' },
          { label: 'Sin categoría', value: int(kpis.sinCat),    accent: kpis.sinCat > 0 ? 'text-orange-500' : 'text-neutral-900' },
          { label: 'Valor catálogo (costo)', value: `$${fmt(kpis.valor)}`, accent: 'text-neutral-900' },
        ]).map(c => (
          <div key={c.label} className="bg-white rounded-xl border border-neutral-200 p-3 shadow-sm">
            <div className="text-xs text-neutral-500 mb-1">{c.label}</div>
            <div className={`text-xl font-bold ${c.accent}`}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* ── header ── */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold text-neutral-900 mr-auto">Catálogo</h1>

        {selected.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-neutral-500">{selected.length} seleccionados</span>
            <select
              value={batchCat ?? ''}
              onChange={e => setBatchCat(Number(e.target.value) || null)}
              className="border border-neutral-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-800"
            >
              <option value="">Cambiar categoría…</option>
              {profitCategories.map(c => (
                <option key={c.id} value={c.id}>{c.name} {c.profit_percentage}%</option>
              ))}
            </select>
            <button
              onClick={handleBatch}
              disabled={!batchCat}
              className="px-3 py-1.5 bg-neutral-900 text-white rounded-lg text-sm font-medium hover:bg-neutral-700 disabled:opacity-40"
            >
              Aplicar
            </button>
          </div>
        )}

        <input
          type="search"
          placeholder="Buscar…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="border border-neutral-300 rounded-lg px-3 py-1.5 text-sm w-52 focus:outline-none focus:ring-2 focus:ring-neutral-800"
        />

        <button
          onClick={openCreate}
          className="px-4 py-1.5 bg-neutral-900 text-white rounded-lg text-sm font-medium hover:bg-neutral-700"
        >
          + Nuevo
        </button>
      </div>

      {/* ── table (desktop) ── */}
      <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
        <div className="overflow-x-auto hidden md:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-100 bg-neutral-50">
                <th className="w-8 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={filteredIds.length > 0 && filteredIds.every(id => selected.includes(id))}
                    onChange={() => toggleAll(filteredIds)}
                    className="cursor-pointer"
                  />
                </th>
                <th onClick={() => toggleSort('code')}
                  className="px-3 py-2 text-left font-medium text-neutral-500 cursor-pointer select-none hover:text-neutral-800">
                  Código{sortArrow('code')}
                </th>
                <th onClick={() => toggleSort('name')}
                  className="px-3 py-2 text-left font-medium text-neutral-500 cursor-pointer select-none hover:text-neutral-800">
                  Nombre{sortArrow('name')}
                </th>
                <th onClick={() => toggleSort('category')}
                  className="px-3 py-2 text-left font-medium text-neutral-500 cursor-pointer select-none hover:text-neutral-800">
                  Categoría{sortArrow('category')}
                </th>
                <th onClick={() => toggleSort('cost')}
                  className="px-3 py-2 text-right font-medium text-neutral-500 cursor-pointer select-none hover:text-neutral-800">
                  Costo{sortArrow('cost')}
                </th>
                <th onClick={() => toggleSort('price')}
                  className="px-3 py-2 text-right font-medium text-neutral-500 cursor-pointer select-none hover:text-neutral-800">
                  Precio{sortArrow('price')}
                </th>
                {country === 'VE' && (
                  <th onClick={() => toggleSort('mlprice')}
                    className="px-3 py-2 text-right font-medium text-neutral-500 cursor-pointer select-none hover:text-neutral-800"
                    title="Precio publicado en ML (con exceso, antes del descuento)">
                    Precio ML{sortArrow('mlprice')}
                  </th>
                )}
                <th onClick={() => toggleSort('margin')}
                  className="px-3 py-2 text-right font-medium text-neutral-500 cursor-pointer select-none hover:text-neutral-800">
                  Margen neto{sortArrow('margin')}
                </th>
                <th onClick={() => toggleSort('stock')}
                  className="px-3 py-2 text-right font-medium text-neutral-500 cursor-pointer select-none hover:text-neutral-800">
                  Stock{sortArrow('stock')}
                </th>
                <th onClick={() => toggleSort('status')}
                  className="px-3 py-2 text-center font-medium text-neutral-500 cursor-pointer select-none hover:text-neutral-800">
                  Estado{sortArrow('status')}
                </th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={country === 'VE' ? 11 : 10} className="px-3 py-8 text-center text-neutral-400">
                    {search ? 'Sin resultados' : 'No hay productos'}
                  </td>
                </tr>
              )}
              {displayed.map(p => {
                const net = mlNetFor(country, p, veRate, coTrm, mlSettings)
                return (
                <tr key={p.id} onClick={() => openView(p.id)}
                  className="border-b border-neutral-50 hover:bg-neutral-50 cursor-pointer">
                  <td className="px-3 py-2 text-center" onClick={e => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selected.includes(p.id)}
                      onChange={() => toggleSelect(p.id)}
                      className="cursor-pointer"
                    />
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-neutral-500">{p.code}</td>
                  <td className="px-3 py-2 font-medium text-neutral-900">{p.name}</td>
                  <td className="px-3 py-2">
                    {p.category_name ? (
                      <span className="text-xs bg-neutral-100 px-2 py-0.5 rounded-full">
                        {p.category_name} {p.profit_percentage}%
                      </span>
                    ) : (
                      <span className="text-neutral-300">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right text-neutral-600">${fmt(p.total_cost)}</td>
                  <td className="px-3 py-2 text-right font-medium text-neutral-900">
                    {country === 'CO' ? `$${fmtPeso(p.sale_price)}` : `$${fmt(liveBaseVE(p))}`}
                  </td>
                  {country === 'VE' && (
                    <td className="px-3 py-2 text-right font-medium text-purple-700">
                      ${fmt(livePublishedVE(p, veRate?.excess ?? 0))}
                    </td>
                  )}
                  <td className="px-3 py-2 text-right">
                    {net ? (
                      <span className={`font-medium ${netColor(net.margen)}`}>
                        {Math.round(net.margen)}%
                      </span>
                    ) : <span className="text-neutral-300">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right text-neutral-600">{p.quantity}</td>
                  <td className="px-3 py-2 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      p.is_active
                        ? 'bg-green-50 text-green-700'
                        : 'bg-neutral-100 text-neutral-400'
                    }`}>
                      {p.is_active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-1 justify-end">
                      <button
                        onClick={() => openEdit(p.id)}
                        className="text-xs px-2 py-1 rounded hover:bg-neutral-100 text-neutral-500 hover:text-neutral-900"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => handleStatus(p.id, p.is_active ? 'deactivate' : 'activate')}
                        className="text-xs px-2 py-1 rounded hover:bg-neutral-100 text-neutral-500 hover:text-neutral-900"
                      >
                        {p.is_active ? 'Desactivar' : 'Activar'}
                      </button>
                      <button
                        onClick={() => handleStatus(p.id, 'delete')}
                        className="text-xs px-2 py-1 rounded hover:bg-red-50 text-neutral-400 hover:text-red-600"
                      >
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* ── cards (mobile) ── */}
        <div className="md:hidden divide-y divide-neutral-100">
          {filtered.length === 0 && (
            <p className="px-3 py-8 text-center text-neutral-400">{search ? 'Sin resultados' : 'No hay productos'}</p>
          )}
          {displayed.map(p => {
            const net = mlNetFor(country, p, veRate, coTrm, mlSettings)
            return (
              <div key={p.id} onClick={() => openView(p.id)} className="px-4 py-3 cursor-pointer active:bg-neutral-50">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-mono text-xs text-neutral-400">{p.code}</div>
                    <div className="font-medium text-neutral-900 truncate">{p.name}</div>
                    {p.category_name && (
                      <span className="inline-block mt-1 text-xs bg-neutral-100 px-2 py-0.5 rounded-full">{p.category_name} {p.profit_percentage}%</span>
                    )}
                  </div>
                  <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${p.is_active ? 'bg-green-50 text-green-700' : 'bg-neutral-100 text-neutral-400'}`}>
                    {p.is_active ? 'Activo' : 'Inactivo'}
                  </span>
                </div>
                <div className="flex items-center gap-4 mt-2 text-sm">
                  <span className="text-neutral-500">Precio: <span className="font-medium text-neutral-900">{country === 'CO' ? `$${fmtPeso(p.sale_price)}` : `$${fmt(liveBaseVE(p))}`}</span></span>
                  {country === 'VE' && (
                    <span className="text-neutral-500">ML: <span className="font-medium text-purple-700">${fmt(livePublishedVE(p, veRate?.excess ?? 0))}</span></span>
                  )}
                  {net && (
                    <span className={netColor(net.margen)}>{Math.round(net.margen)}% neto</span>
                  )}
                  <span className="text-neutral-500 ml-auto">Stock: <span className="font-medium text-neutral-900">{p.quantity}</span></span>
                </div>
                <div className="flex items-center gap-2 mt-2" onClick={e => e.stopPropagation()}>
                  <button onClick={() => openEdit(p.id)} className="text-xs px-3 py-1 border border-neutral-200 rounded-lg text-neutral-600">Editar</button>
                  <button onClick={() => handleStatus(p.id, p.is_active ? 'deactivate' : 'activate')} className="text-xs px-3 py-1 border border-neutral-200 rounded-lg text-neutral-600">
                    {p.is_active ? 'Desactivar' : 'Activar'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        <div className="px-3 py-2 border-t border-neutral-100 flex items-center justify-between text-xs text-neutral-400">
          <span>
            Mostrando {displayed.length} de {filtered.length}
            {filtered.length !== products.length && ` (${products.length} total)`}
          </span>
          {hasMore && (
            <button
              onClick={() => setVisible(v => v + PAGE_SIZE)}
              className="px-3 py-1 text-xs bg-neutral-100 hover:bg-neutral-200 rounded text-neutral-700"
            >
              Cargar 100 más
            </button>
          )}
        </div>
      </div>

      {/* ── slide-over ── */}
      {modal && (
        <div className="fixed inset-0 z-50">
          <div className={`absolute inset-0 bg-black/30 transition-opacity duration-200 ${mounted ? 'opacity-100' : 'opacity-0'}`} onClick={closeModal} />
          <div className={`absolute right-0 top-0 h-full w-full max-w-xl bg-white shadow-2xl flex flex-col transition-transform duration-200 ${mounted ? 'translate-x-0' : 'translate-x-full'}`}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100 shrink-0">
              <h2 className="font-bold text-neutral-900">
                {modal === 'create' ? 'Nuevo Producto' : 'Editar Producto'}
              </h2>
              <button
                onClick={closeModal}
                className="text-neutral-400 hover:text-neutral-700 text-lg"
              >
                ✕
              </button>
            </div>

            <div className="px-6 py-4 space-y-4 flex-1 overflow-y-auto">
              {okMsg && <div className="bg-green-50 border border-green-200 text-green-700 px-3 py-2 rounded text-sm">{okMsg}</div>}
              {/* código + nombre */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-1">Código</label>
                  <input
                    value={form.code}
                    onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                    readOnly={modal === 'edit'}
                    className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm font-mono
                               focus:outline-none focus:ring-2 focus:ring-neutral-800 read-only:bg-neutral-50 read-only:text-neutral-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-1">Nombre</label>
                  <input
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm
                               focus:outline-none focus:ring-2 focus:ring-neutral-800"
                  />
                </div>
              </div>

              {/* ── Precios ── */}
              <div className="border border-neutral-200 rounded-xl p-4 space-y-3">
                <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">Calculadora de precios</p>

                {/* costo / envío / total */}
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-neutral-600 mb-1">Costo ($)</label>
                    <input
                      type="number" min="0" step="0.01"
                      value={form.base_cost}
                      onChange={e => setForm(f => ({ ...f, base_cost: Number(e.target.value) }))}
                      className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm
                                 focus:outline-none focus:ring-2 focus:ring-neutral-800"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-600 mb-1">Envío ($)</label>
                    <input
                      type="number" min="0" step="0.01"
                      value={form.shipping_cost}
                      onChange={e => setForm(f => ({ ...f, shipping_cost: Number(e.target.value) }))}
                      className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm
                                 focus:outline-none focus:ring-2 focus:ring-neutral-800"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-600 mb-1">Total</label>
                    <div className="w-full border border-neutral-200 bg-neutral-50 rounded-lg px-3 py-2 text-sm font-bold text-neutral-800">
                      ${fmt(totalCost)}
                    </div>
                  </div>
                </div>

                {/* categoría */}
                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-1">Categoría de ganancia</label>
                  <select
                    value={form.profit_category_id ?? ''}
                    onChange={e => setForm(f => ({ ...f, profit_category_id: Number(e.target.value) || null }))}
                    className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm
                               focus:outline-none focus:ring-2 focus:ring-neutral-800 bg-white"
                  >
                    <option value="">Sin categoría</option>
                    {profitCategories.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name} — {c.profit_percentage}%
                      </option>
                    ))}
                  </select>
                </div>

                {/* Precios calculados (organización estilo legacy) */}
                <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-3 space-y-3">
                  <p className="text-sm font-semibold text-neutral-700">Precios calculados</p>

                  <div className="grid grid-cols-2 gap-2">
                    {/* Costo Base */}
                    <div className="bg-white border border-neutral-200 rounded-lg p-2.5">
                      <p className="text-[11px] text-neutral-500">Costo Base (Costo + Envío)</p>
                      <p className="text-lg font-bold text-neutral-800">${fmt(totalCost)}</p>
                    </div>
                    {/* Precio Base = precio que se registra en la venta (inventario) */}
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5">
                      <p className="text-[11px] text-blue-600 font-medium">Precio de venta (va a Ventas)</p>
                      <p className="text-lg font-bold text-blue-700">${fmt(basePriceUsd)}</p>
                      <p className="text-[10px] text-neutral-400">Costo Base × {(1 + profitPct / 100).toFixed(2)}</p>
                    </div>

                    {country === 'VE' && (
                      <>
                        {/* Precio Exceso ML */}
                        <div className="bg-purple-50 border border-purple-200 rounded-lg p-2.5">
                          <p className="text-[11px] text-purple-600">Precio Exceso ML ({veRate?.excess ?? 0}%)</p>
                          <p className="text-lg font-bold text-purple-700">${fmt(suggestedMl)}</p>
                          <p className="text-[10px] text-neutral-400">Base × {(1 + (veRate?.excess ?? 0) / 100).toFixed(2)}</p>
                        </div>
                        {/* Tasas actuales */}
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                          <p className="text-[11px] text-amber-700 font-medium">Tasas actuales</p>
                          <p className="text-[11px] text-neutral-600">Oficial: <b>Bs {fmt(veRate?.official ?? 0)}</b></p>
                          <p className="text-[11px] text-neutral-600">Paralelo: <b>Bs {fmt(veRate?.parallel ?? 0)}</b></p>
                          <p className="text-[11px] text-neutral-600">Spread: <b>{spread.toFixed(1)}%</b></p>
                        </div>
                      </>
                    )}
                  </div>

                  {country === 'VE' ? (
                    <>
                      {/* Descuento ML */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs font-medium text-neutral-700">
                            Descuento ML: <b>{form.discount_percent.toFixed(1)}%</b>
                          </label>
                          {recDiscount > 0 && (
                            <button type="button"
                              onClick={() => setForm(f => ({ ...f, discount_percent: Math.round(recDiscount * 10) / 10 }))}
                              className="text-[11px] text-blue-600 hover:underline">
                              Rec: {recDiscount.toFixed(1)}%
                            </button>
                          )}
                        </div>
                        <div className="grid grid-cols-4 gap-2 items-center">
                          <input type="range" min="0" max="99" step="0.5"
                            value={form.discount_percent}
                            onChange={e => setForm(f => ({ ...f, discount_percent: Number(e.target.value) }))}
                            className="col-span-3 accent-neutral-800" />
                          <input type="number" min="0" max="99" step="0.5"
                            value={form.discount_percent}
                            onChange={e => setForm(f => ({ ...f, discount_percent: Number(e.target.value) }))}
                            className="border border-neutral-300 rounded-lg px-2 py-1 text-sm text-center font-bold
                                       focus:outline-none focus:ring-2 focus:ring-neutral-800" />
                        </div>
                      </div>

                    </>
                  ) : (
                    /* Colombia — costo USD, precio de venta en PESOS (sugerido por TRM) */
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5">
                          <p className="text-[11px] text-blue-600 font-medium">Precio Base (USD)</p>
                          <p className="text-lg font-bold text-blue-700">${fmt(basePriceUsd)}</p>
                          <p className="text-[10px] text-neutral-400">Costo × {(1 + profitPct / 100).toFixed(2)}</p>
                        </div>
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                          <p className="text-[11px] text-amber-700 font-medium">Sugerido en pesos</p>
                          <p className="text-lg font-bold text-amber-700">${fmtPeso(suggestedPesos)}</p>
                          <p className="text-[10px] text-neutral-400">Base × TRM {fmtPeso(coTrm)}</p>
                        </div>
                      </div>
                      {/* Precio de venta real (lo que publicas en ML), en pesos */}
                      <div className="bg-green-50 border-2 border-green-400 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[11px] text-green-700 font-medium">Precio de venta (pesos)</label>
                          {suggestedPesos > 0 && (
                            <button type="button"
                              onClick={() => setForm(f => ({ ...f, sale_price: suggestedPesos }))}
                              className="text-[11px] text-green-700 hover:underline">
                              Usar sugerido (${fmtPeso(suggestedPesos)})
                            </button>
                          )}
                        </div>
                        <input
                          type="text" inputMode="numeric"
                          value={form.sale_price ? fmtPeso(form.sale_price) : ''}
                          onChange={e => {
                            const digits = e.target.value.replace(/\D/g, '')
                            setForm(f => ({ ...f, sale_price: digits ? parseInt(digits, 10) : 0 }))
                          }}
                          placeholder="0"
                          className="w-full border border-green-300 rounded-lg px-3 py-2 text-xl font-bold text-green-700
                                     focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                        />
                        <p className="text-[10px] text-neutral-400 mt-1">
                          {coTrm > 0 ? `≈ $${fmt(form.sale_price / coTrm)} USD a la TRM` : 'Sin TRM cargada'}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Lo que realmente te queda — cascada compartida (parámetros en Ajustes) */}
                  <div className="border-t border-neutral-200 pt-3">
                    <p className="text-sm font-semibold text-neutral-700 mb-2">Lo que realmente te queda</p>
                    <MlBreakdown
                      country={country}
                      totalCost={totalCost}
                      ml={mlSettings}
                      finalPriceUsd={finalPriceUsd}
                      veRate={veRate}
                      priceBs={priceBs}
                      salePrice={form.sale_price || suggestedPesos}
                      coTrm={coTrm}
                    />
                  </div>
                </div>
              </div>

              {/* Nota del precio de venta de inventario */}
              <p className="text-xs text-neutral-400 -mt-1">
                {country === 'CO'
                  ? <>El <b>costo</b> se guarda en USD y el <b>precio de venta</b> en pesos (${fmtPeso(form.sale_price)}).</>
                  : <>El precio de venta de inventario se guarda igual al <b>Precio Base</b> (${fmt(basePriceUsd)}).</>}
              </p>

              {/* ML codes — en una sola línea */}
              <div className="border border-neutral-200 rounded-xl p-4 space-y-2">
                <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">
                  Códigos ML ({country})
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {form.ml_codes.map((ml, i) => (
                    <div key={ml.account}>
                      <label className="block text-[11px] font-mono text-neutral-500 mb-1">{ml.account}</label>
                      <input
                        value={ml.code}
                        onChange={e => setForm(f => ({
                          ...f,
                          ml_codes: f.ml_codes.map((m, j) => j === i ? { ...m, code: e.target.value } : m),
                        }))}
                        placeholder="MLA-XXXXXXXXXX"
                        className="w-full border border-neutral-300 rounded-lg px-3 py-1.5 text-sm
                                   focus:outline-none focus:ring-2 focus:ring-neutral-800"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}
            </div>

            <div className="px-6 py-4 border-t border-neutral-100 flex justify-end gap-3 bg-neutral-50 shrink-0">
              <button
                onClick={closeModal}
                className="px-4 py-2 text-sm text-neutral-600 hover:text-neutral-900"
              >
                Cancelar
              </button>
              {modal === 'create' && (
                <button
                  onClick={() => handleSave(true)}
                  disabled={saving || !form.code || !form.name}
                  className="px-4 py-2 border border-neutral-300 text-neutral-700 rounded-lg text-sm font-medium hover:bg-neutral-100 disabled:opacity-50"
                >
                  {saving ? 'Guardando…' : 'Guardar y crear otro'}
                </button>
              )}
              <button
                onClick={() => handleSave(false)}
                disabled={saving || !form.code || !form.name}
                className="px-4 py-2 bg-neutral-900 text-white rounded-lg text-sm font-medium
                           hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── vista de lectura (slide-over) ── */}
      {viewing && (() => {
        const v = viewing
        const net = mlNetFor(country, v, veRate, coTrm, mlSettings)
        const Field = ({ label, value, accent = 'text-neutral-900' }: { label: string; value: ReactNode; accent?: string }) => (
          <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-2.5">
            <p className="text-[11px] text-neutral-500">{label}</p>
            <p className={`text-sm font-semibold ${accent}`}>{value}</p>
          </div>
        )
        return (
          <div className="fixed inset-0 z-50">
            <div className={`absolute inset-0 bg-black/30 transition-opacity duration-200 ${viewMounted ? 'opacity-100' : 'opacity-0'}`} onClick={closeView} />
            <div className={`absolute right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl flex flex-col transition-transform duration-200 ${viewMounted ? 'translate-x-0' : 'translate-x-full'}`}>
              {/* header */}
              <div className="flex items-start justify-between px-6 py-4 border-b border-neutral-100 shrink-0">
                <div className="min-w-0">
                  <div className="font-mono text-xs text-neutral-400">{v.code}</div>
                  <h2 className="font-bold text-neutral-900 truncate">{v.name}</h2>
                  <div className="mt-1 flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${v.is_active ? 'bg-green-50 text-green-700' : 'bg-neutral-100 text-neutral-400'}`}>
                      {v.is_active ? 'Activo' : 'Inactivo'}
                    </span>
                    {v.category_name && (
                      <span className="text-xs bg-neutral-100 px-2 py-0.5 rounded-full">{v.category_name} {v.profit_percentage}%</span>
                    )}
                  </div>
                </div>
                <button onClick={closeView} className="text-neutral-400 hover:text-neutral-700 text-lg">✕</button>
              </div>

              {/* body */}
              <div className="px-6 py-4 space-y-4 flex-1 overflow-y-auto text-sm">
                <div>
                  <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2">Costos</p>
                  <div className="grid grid-cols-3 gap-2">
                    <Field label="Costo" value={`$${fmt(v.base_cost)}`} />
                    <Field label="Envío" value={`$${fmt(v.shipping_cost)}`} />
                    <Field label="Costo total" value={`$${fmt(v.total_cost)}`} />
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2">Precios</p>
                  {country === 'VE' ? (
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="Precio base (a Ventas)" value={`$${fmt(liveBaseVE(v))}`} accent="text-blue-700" />
                      <Field label="Precio publicado" value={`$${fmt(liveBaseVE(v) * (1 + (veRate?.excess ?? 0) / 100))}`} />
                      <Field label="Descuento" value={`${fmt(v.discount_percent)}%`} />
                      <Field label="Venta c/ descuento (ML)" value={`$${fmt(liveFinalVE(v, veRate?.excess ?? 0))}`} accent="text-green-700" />
                      <Field label="Precio Bs" value={`Bs ${fmt(liveFinalVE(v, veRate?.excess ?? 0) * (veRate?.official ?? 0))}`} />
                      {net && (
                        <Field label="Margen neto" value={`${Math.round(net.margen)}%`} accent={netColor(net.margen)} />
                      )}
                    </div>
                  ) : (
                    /* CO: el precio de venta está en pesos (sección Inventario); aquí el análisis en USD */
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="Precio venta ≈ USD" value={coTrm > 0 ? `$${fmt(v.sale_price / coTrm)}` : '—'} accent="text-green-700" />
                      {net && (
                        <Field label="Margen neto" value={`${Math.round(net.margen)}%`} accent={netColor(net.margen)} />
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2">Lo que realmente te queda</p>
                  <MlBreakdown
                    country={country}
                    totalCost={v.total_cost}
                    ml={mlSettings}
                    finalPriceUsd={liveFinalVE(v, veRate?.excess ?? 0)}
                    veRate={veRate}
                    priceBs={liveFinalVE(v, veRate?.excess ?? 0) * (veRate?.official ?? 0)}
                    salePrice={v.sale_price}
                    coTrm={coTrm}
                  />
                </div>

                <div>
                  <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2">Inventario</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Stock" value={int(v.quantity)} accent={v.quantity > 0 ? 'text-neutral-900' : 'text-red-600'} />
                    <Field label="Precio de venta" value={country === 'CO' ? `$${fmtPeso(v.sale_price)}` : `$${fmt(v.sale_price)}`} accent={country === 'CO' ? 'text-green-700' : undefined} />
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2">Códigos ML ({country})</p>
                  {v.ml_codes.length > 0 ? (
                    <div className="grid grid-cols-2 gap-2">
                      {v.ml_codes.map(ml => (
                        <div key={ml.account} className="bg-neutral-50 border border-neutral-200 rounded-lg p-2.5">
                          <p className="text-[11px] font-mono text-neutral-500">{ml.account}</p>
                          <p className="text-sm font-mono text-neutral-800">{ml.code || '—'}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-neutral-400 text-xs">Sin códigos ML registrados</p>
                  )}
                </div>
              </div>

              {/* footer: acciones */}
              <div className="px-6 py-4 border-t border-neutral-100 flex flex-wrap justify-end gap-2 bg-neutral-50 shrink-0">
                <button
                  onClick={async () => {
                    const ok = await handleStatus(v.id, 'delete')
                    if (ok) closeView()
                  }}
                  className="px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg mr-auto"
                >
                  Eliminar
                </button>
                <button
                  onClick={async () => {
                    const ok = await handleStatus(v.id, v.is_active ? 'deactivate' : 'activate')
                    if (ok) setViewing(prev => prev ? { ...prev, is_active: !prev.is_active } : prev)
                  }}
                  className="px-4 py-2 border border-neutral-300 text-neutral-700 rounded-lg text-sm font-medium hover:bg-neutral-100"
                >
                  {v.is_active ? 'Desactivar' : 'Activar'}
                </button>
                <button
                  onClick={() => { closeView(); openEdit(v.id) }}
                  className="px-4 py-2 bg-neutral-900 text-white rounded-lg text-sm font-medium hover:bg-neutral-700"
                >
                  Editar
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
