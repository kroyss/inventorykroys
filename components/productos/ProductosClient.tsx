'use client'
import { useState, useCallback, useEffect, useMemo, type ReactNode } from 'react'
import { FotoProducto, FotoEditable } from '@/components/ui/FotoProducto'
import type { Product, ProfitCategory, Country, MLCode } from '@/lib/types'
import { int, PageHeader, KPICard, StatusBadge, RowMenu } from '@/components/ui'
import { useEscape } from '@/components/ui/useEscape'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import NumberInput from '@/components/ui/NumberInput'
import { coPublishedPrice } from '@/lib/coPricing'
import { matchTokens } from '@/lib/search'
import { shipInfo, parseShippingTable, type ShipInfo } from '@/lib/mlShipping'
import { liveBaseVE, liveFinalVE, livePublishedVE, recDiscountVE, mlNetFor, storedPricesVE, type VeRate } from '@/lib/pricingVE'
import Link from '@/components/ui/Link'
import MlBreakdown from './MlBreakdown'
import VinculosML from './VinculosML'
import ElegirPesoML from './ElegirPesoML'
import MedidorGanancia from './MedidorGanancia'
import CostosMLModal from './CostosMLModal'
import { umbralesDe, nivelDe, colorRentab, AYUDA_RENTABILIDAD, type Umbrales } from '@/lib/salud'

// ─── helpers ────────────────────────────────────────────────────
function fmt(n: number) {
  return Number(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
// Pesos colombianos: sin decimales (ej. 140.700)
function fmtPeso(n: number) {
  return Number(n).toLocaleString('de-DE', { maximumFractionDigits: 0 })
}


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

// Etiqueta de estado de MercadoEnvíos (envío gratis por peso).
function shipBadge(info: ShipInfo): { label: string; cls: string } {
  switch (info.status) {
    case 'ok':           return { label: '✅ Envío gratis', cls: 'text-green-700 bg-green-50 border-green-200' }
    case 'capped':       return { label: `✅ Envío gratis · tope ${info.maxDiscount!.toFixed(1)}%`, cls: 'text-amber-700 bg-amber-50 border-amber-200' }
    case 'aggregate':    return { label: `🛒 Gratis juntando ~${info.unitsForFree} uds`, cls: 'text-sky-700 bg-sky-50 border-sky-200' }
    case 'impossible':   return { label: '🚫 Revisar: precio muy bajo para su peso', cls: 'text-red-700 bg-red-50 border-red-200' }
    case 'overweight':   return { label: '⚠️ Peso fuera de la tabla', cls: 'text-red-700 bg-red-50 border-red-200' }
    default:             return { label: '⚪ Peso sin registrar', cls: 'text-neutral-600 bg-neutral-50 border-neutral-200' }
  }
}

// Color de la rentabilidad sobre costo (14-11): sana / ajustada / pérdida con los % de la empresa (lib/salud.ts).
const netColor = (m: number, u: Umbrales) => colorRentab(m, u)
const fmtPct = (n: number) => `${Number.isInteger(Math.round(n * 10) / 10) ? Math.round(n) : (Math.round(n * 10) / 10).toLocaleString('de-DE')}%`

// ─── types ──────────────────────────────────────────────────────
interface FormState {
  code: string
  name: string
  ganancia_pct: number | null   // 14-11 (mig. 179): % de ganancia (reemplaza a la categoría)
  base_cost: number
  shipping_cost: number
  published_price_usd: number
  discount_percent: number
  sale_price: number
  weight_kg: string   // string para permitir vacío en el input
  peso_ml?: boolean   // mig. 174: el peso viene del portal de MercadoEnvíos (no se edita a mano)
  pesos_ml?: number[] | null   // sus publicaciones pesan distinto en ML: se elige uno con un clic
  ml_codes: MLCode[]   // solo lectura (13-11): los vínculos se hacen en Publicaciones → Vincular
}

const emptyForm = (): FormState => ({
  code: '',
  name: '',
  ganancia_pct: null,
  base_cost: 0,
  shipping_cost: 0,
  published_price_usd: 0,
  discount_percent: 0,
  sale_price: 0,
  weight_kg: '',
  ml_codes: [],
})

// Detalle completo de un producto (respuesta de GET /api/products/[id])
interface ProductDetail {
  id: number
  peso_origen?: string | null
  pesos_ml?: number[] | null
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
  ganancia_pct: number | null
  sale_price: number
  quantity: number
  weight_kg: number | null
  ml_codes: MLCode[]
}

// ─── component ──────────────────────────────────────────────────
interface Props {
  initialProducts:  Product[]
  profitCategories: ProfitCategory[]
  country:          Country
  mlAccounts: string[]   // cuentas ML de la empresa (Ajustes o, si no hay, las conectadas)
  descuento: boolean     // módulo Descuento ML: sin él el descuento vale 0 (/api/settings) y no se muestra
  catalogo?: boolean     // módulo catalogo_pdf (Catálogo PDF para WhatsApp)
  importarML?: boolean   // permiso "Importar productos desde MercadoLibre" + cuentas de ML (Primeros pasos)
  categorias?: boolean   // módulo precios_categorias. Apagado (Inventario simple): precio = lo publicado, sin categoría ni exceso
  promociones?: boolean  // módulo promociones + permiso (migración 094): link a Promociones
  publicarML?: boolean   // 14-11: puede cambiar el precio en ML (módulo Publicaciones + permiso editar_publicaciones)
  costosML?: boolean     // 14-11: puede configurar Costos ML (admin o permiso costos_ml_config)
}

export default function ProductosClient({ initialProducts, profitCategories, country, mlAccounts, descuento, importarML = false, categorias = true, promociones = false, catalogo = false, publicarML = false, costosML = false, inicialTasa = null }: Props & { inicialTasa?: import('@/lib/inicial').TasaYAjustes | null }) {
  // Inventario simple: el precio de venta es el que se guardó (lo publicado en ML), no costo × categoría × exceso.
  const simple = !categorias
  const [products,  setProducts]  = useState<Product[]>(initialProducts)
  const [search,    setSearch]    = useState('')
  const [selected,  setSelected]  = useState<number[]>([])
  const [batchPct,  setBatchPct]  = useState('')   // 14-11: recargo en lote (antes categoría)
  const [simPct,    setSimPct]    = useState<number | null>(null)   // modo simple: % que se está simulando en la ficha
  const [verCostos, setVerCostos] = useState(false)
  const [modal,     setModal]     = useState<'create' | 'edit' | null>(null)
  const [editId,    setEditId]    = useState<number | null>(null)
  const [form,      setForm]      = useState<FormState>(emptyForm())
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState('')
  const [okMsg,     setOkMsg]     = useState('')
  const [mounted,   setMounted]   = useState(false)

  // Vista de lectura (slide-over de solo lectura al clickear una fila)
  const [viewing,     setViewing]     = useState<ProductDetail | null>(null)
  const [viewMounted, setViewMounted] = useState(false)

  const confirm = useConfirm()

  // Tasa VE (para exceso/descuento sugerido). Solo aplica en VE.
  // 12-11 (rapidez): tasa y Ajustes vienen en el HTML (inicialTasa); lo que falte se pide como antes.
  const tIni = country === 'VE' ? inicialTasa?.rate : null
  const [veRate, setVeRate] = useState<VeRate | null>(tIni?.official_rate ? { official: tIni.official_rate, parallel: tIni.parallel_rate, excess: tIni.excess_percentage } : null)
  const conRate = !!tIni?.official_rate
  useEffect(() => {
    if (country !== 'VE' || conRate) return
    fetch('/api/rates/latest').then(r => r.json()).then(d => {
      setVeRate({ official: d.official_rate, parallel: d.parallel_rate, excess: d.excess_percentage })
    }).catch(() => {})
  }, [country, conRate])

  // Tasa TRM (CO): para sugerir el precio de venta en pesos a partir del costo USD.
  const [coTrm, setCoTrm] = useState(0)
  useEffect(() => {
    if (country !== 'CO') return
    fetch('/api/rates/co/latest').then(r => r.json()).then(d => {
      setCoTrm(Number(d.trm_rate) || 0)
    }).catch(() => {})
  }, [country])

  // Parámetros de costos ML (Productos → Costos ML) para lo que te queda y la rentabilidad.
  const [mlSettings, setMlSettings] = useState<Record<string, string>>(inicialTasa?.settings ?? {})
  const conSettings = !!inicialTasa?.settings
  useEffect(() => {
    if (conSettings) return
    fetch('/api/settings').then(r => r.json())
      .then(d => setMlSettings(d && typeof d === 'object' ? d : {})).catch(() => {})
  }, [conSettings])

  // derived calculator values
  const profitPct   = form.ganancia_pct ?? 0
  const umbr = umbralesDe(mlSettings)
  // Descuento GLOBAL efectivo (VE): el manual de Ajustes (ml_descuento) o, si está vacío, el recomendado.
  const recDiscountLive = recDiscountVE(veRate)
  const globalDiscount  = (() => {
    const raw = mlSettings.ml_descuento
    const n = raw == null || raw === '' ? NaN : parseFloat(raw)
    return isNaN(n) ? recDiscountLive : n
  })()
  const {
    totalCost, basePriceUsd, suggestedMl, publishedPriceUsd,
  } = calcPrices(
    // publicado = derivado del precio sugerido ML (no input suelto), igual que legacy.
    // El descuento es el GLOBAL (config en Ajustes), no un input por producto.
    form.base_cost, form.shipping_cost, profitPct, veRate, undefined, globalDiscount
  )

  // ── MercadoEnvíos (VE): tabla peso→precio mín y descuento efectivo capado por peso ──
  const shipTable = useMemo(() => parseShippingTable(mlSettings.ml_shipping_table), [mlSettings.ml_shipping_table])
  // Descuento efectivo por producto = global limitado por su tope de envío gratis (solo VE).
  const shipFor = (p: { weight_kg: number | null; total_cost: number; profit_percentage: number }): ShipInfo =>
    shipInfo(p.weight_kg, livePublishedVE(p, veRate?.excess ?? 0), globalDiscount, shipTable)
  const effDiscountFor = (p: { weight_kg: number | null; total_cost: number; profit_percentage: number }): number =>
    country === 'VE' ? shipFor(p).effectiveDiscount : globalDiscount

  // Recargo sobre costo que se muestra (14-11, igual para todos): con precios calculados, el del producto; en el modo
  // simple (el precio es el de ML), el REAL que da su precio sobre el costo.
  const gananciaDe = (p: Product): number | null => {
    if (!simple) return p.ganancia_pct ?? (p.profit_category_id ? p.profit_percentage : null)
    if (!(p.total_cost > 0) || !(p.sale_price > 0)) return null
    const costo = country === 'CO' ? p.total_cost * coTrm : p.total_cost
    return costo > 0 ? (p.sale_price / costo - 1) * 100 : null
  }
  // Precio y rentabilidad por producto: en modo simple, el guardado (sale_price); si no, el calculado en vivo.
  const precioVE    = (p: Product) => simple ? p.sale_price : liveBaseVE(p)
  const publicadoVE = (p: Product) => simple ? p.sale_price : livePublishedVE(p, veRate?.excess ?? 0)
  const netDe = (p: Product, disc?: number) => simple
    ? mlNetFor(country, p, veRate, coTrm, mlSettings, 0, shipTable, country === 'VE' ? p.sale_price : undefined)
    : mlNetFor(country, p, veRate, coTrm, mlSettings, disc, shipTable)

  // Descuento efectivo del FORM (capado por el peso ingresado en el form).
  const formWeight = form.weight_kg.trim() === '' ? null : parseFloat(form.weight_kg)
  const formShip = shipInfo(isNaN(formWeight as number) ? null : formWeight, publishedPriceUsd, globalDiscount, shipTable)
  const formEffDiscount = country === 'VE' ? formShip.effectiveDiscount : globalDiscount
  const finalPriceUsd = publishedPriceUsd * (1 - formEffDiscount / 100)

  const spread  = veRate && veRate.official > 0 ? (veRate.parallel - veRate.official) / veRate.official * 100 : 0
  const priceBs = finalPriceUsd * (veRate?.official ?? 0)
  // CO: precio a PUBLICAR en pesos. El objetivo es que, después de que ML se
  // lleve comisión + envío + retención, quede el precio base (costo × markup).
  // Publicar base × TRM a secas se come el markup (ver lib/coPricing.ts).
  const suggestedPesos = coPublishedPrice(basePriceUsd * coTrm, mlSettings)

  // Modo simple (14-11): el medidor arranca en el % REAL del precio publicado y, al moverlo, sugiere el precio.
  const costoForm = country === 'CO' ? totalCost * coTrm : totalCost
  const pctReal = costoForm > 0 && form.sale_price > 0 ? (form.sale_price / costoForm - 1) * 100 : null
  const precioPara = (pct: number) => country === 'CO' ? Math.round(costoForm * (1 + pct / 100)) : Math.round(costoForm * (1 + pct / 100) * 100) / 100
  const simulando = simple && simPct != null && costoForm > 0
  const precioSim = simulando ? precioPara(simPct!) : form.sale_price
  // Precio que se mira en la cascada y el que se mandaría a ML.
  const precioVista = simple ? precioSim : country === 'CO' ? (form.sale_price || suggestedPesos) : finalPriceUsd
  const precioParaML = simple ? precioSim : country === 'CO' ? form.sale_price : Math.round(publishedPriceUsd * 100) / 100
  const netForm = totalCost > 0 ? mlNetFor(country,
    { total_cost: totalCost, profit_percentage: profitPct, discount_percent: formEffDiscount, sale_price: country === 'CO' ? precioVista : form.sale_price, weight_kg: formWeight != null && !isNaN(formWeight) ? formWeight : null },
    veRate, coTrm, mlSettings, formEffDiscount, shipTable, simple && country === 'VE' ? precioSim : undefined) : null
  const nivelForm = netForm ? nivelDe(netForm.rentabilidad, umbr) : null
  // Publicaciones de 1 unidad vinculadas: a ellas se les puede mandar el precio (los packs tienen su propio precio).
  const pubsML = [...new Set(form.ml_codes.filter(c => (c.unidades ?? 1) === 1 && /^\d+/.test(c.code))
    .map(c => `${country === 'CO' ? 'MCO' : 'MLV'}${c.code.split(':')[0]}`))]
  const conVariantes = form.ml_codes.some(c => c.code.includes(':'))
  const puedePublicar = publicarML && modal === 'edit' && pubsML.length > 0 && precioParaML > 0

  // CO: el precio de venta nunca debe quedar en blanco. Si el producto ya trae
  // un valor (nuevo o viejo) se respeta; si está vacío, se autocompleta con el
  // sugerido apenas esté disponible (una sola vez por apertura del form, para
  // no pelear con el usuario si luego borra el campo a mano).
  const [salePriceAutoFilled, setSalePriceAutoFilled] = useState(false)
  useEffect(() => {
    if (country !== 'CO' || simple || (modal !== 'create' && modal !== 'edit') || salePriceAutoFilled) return
    if (form.sale_price > 0) { setSalePriceAutoFilled(true); return }
    if (suggestedPesos > 0) {
      setForm(f => ({ ...f, sale_price: suggestedPesos }))
      setSalePriceAutoFilled(true)
    }
  }, [country, simple, modal, salePriceAutoFilled, form.sale_price, suggestedPesos])

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
    const data = await res.json()
    setViewing(data)
    setViewWeight(data.weight_kg != null ? String(data.weight_kg) : '')
  }

  // Peso editable desde la ficha (MercadoEnvíos)
  const [viewWeight, setViewWeight] = useState('')
  const [savingWeight, setSavingWeight] = useState(false)
  async function saveViewWeight() {
    if (!viewing) return
    const kg = viewWeight.trim() === '' ? null : parseFloat(viewWeight)
    if (kg !== null && (isNaN(kg) || kg <= 0)) { setError('Peso inválido'); return }
    setSavingWeight(true)
    const res = await fetch(`/api/products/${viewing.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weight_kg: kg, confirmar_peso: true }),
    })
    setSavingWeight(false)
    if (!res.ok) { setError((await res.json()).error ?? 'Error al guardar peso'); return }
    setViewing({ ...viewing, weight_kg: kg, peso_origen: 'manual' })
    setProducts(ps => ps.map(p => p.id === viewing.id ? { ...p, weight_kg: kg, peso_origen: 'manual' } : p))
  }

  // ── open create modal ──
  async function openCreate() {
    setError('')
    const res  = await fetch('/api/products/next-code')
    const data = await res.json()
    setForm({ ...emptyForm(), code: data.next_code ?? data.code })
    setEditId(null)
    setSimPct(null)
    setSalePriceAutoFilled(false)
    setModal('create')
  }

  // ── open edit modal ──
  async function openEdit(id: number) {
    setError('')
    const res  = await fetch(`/api/products/${id}`)
    const data = await res.json()
    setSalePriceAutoFilled(false)
    setForm({
      code:               data.code,
      name:               data.name,
      ganancia_pct:       data.ganancia_pct ?? (data.profit_category_id ? data.profit_percentage : null),
      base_cost:          data.base_cost,
      shipping_cost:      data.shipping_cost,
      published_price_usd:data.published_price_usd,
      discount_percent:   data.discount_percent,
      sale_price:         data.sale_price,
      weight_kg:          data.weight_kg != null ? String(data.weight_kg) : '',
      peso_ml:            data.peso_origen === 'ml',
      pesos_ml:           data.pesos_ml ?? null,
      ml_codes:           data.ml_codes as MLCode[],
    })
    setEditId(id)
    setSimPct(null)
    setModal('edit')
  }

  // ── save (create or update) ──
  // over (14-11): «Guardar y publicar en ML» guarda con el precio sugerido y después lo manda a MercadoLibre.
  const handleSave = useCallback(async (keepOpen = false, over?: { salePrice?: number; publicar?: number }) => {
    if (over?.publicar && !await confirm({
      title: 'Cambiar el precio en MercadoLibre',
      message: `Se guarda el producto y el precio de ${pubsML.length === 1 ? 'su publicación' : `sus ${pubsML.length} publicaciones`} pasa a ${country === 'CO' ? `$${fmtPeso(over.publicar)}` : `$${fmt(over.publicar)}`} en MercadoLibre:\n${pubsML.join(' · ')}${conVariantes ? '\n\nOjo: si la publicación tiene variantes de otros productos, cambia el precio de toda la publicación.' : ''}\n\nLo verás en Publicaciones → Tareas.`,
      confirmText: 'Guardar y publicar',
    })) return
    setSaving(true)
    setError(''); setOkMsg('')
    const salePrice = over?.salePrice ?? form.sale_price
    try {
      // CO (híbrido): costo en USD, precio de venta en PESOS (sale_price); los
      // campos *_usd no se usan en CO → 0. VE: calculadora USD como siempre.
      const isCO = country === 'CO'
      const weightNum = form.weight_kg.trim() === '' || isNaN(parseFloat(form.weight_kg))
        ? null : parseFloat(form.weight_kg)
      // Inventario simple VE: el precio que se escribe es el publicado y se guarda tal cual (sin descuento).
      const simpleVE = simple && !isCO
      const precios = {
        base_price_usd:      isCO ? 0 : simpleVE ? salePrice : basePriceUsd,
        published_price_usd: isCO ? 0 : simpleVE ? salePrice : publishedPriceUsd,
        final_price_usd:     isCO ? 0 : simpleVE ? salePrice : finalPriceUsd,
        // descuento efectivo = global capado por el peso (envío gratis)
        discount_percent:    isCO || simpleVE ? 0 : formEffDiscount,
        // VE: el precio de inventario sigue al Precio Base (USD). CO y simple: el del input.
        sale_price:          isCO || simpleVE ? salePrice : basePriceUsd,
      }
      // Los códigos ML ya no se mandan (13-11): se vinculan en Publicaciones → Vincular.
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { ml_codes: _codigos, peso_ml: _pm, pesos_ml: _pd, ...sinVinculos } = form
      const payload = {
        ...sinVinculos,
        ganancia_pct: simple ? null : form.ganancia_pct,
        ...precios,
        weight_kg:           weightNum,
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
            ...(simple ? {} : { ganancia_pct: form.ganancia_pct }),
            base_cost:          form.base_cost,
            shipping_cost:      form.shipping_cost,
            ...precios,
            weight_kg:          weightNum,
          }),
        })
      }

      if (!res.ok) {
        const d = await res.json()
        setError(d.error ?? 'Error al guardar')
        return
      }

      // 14-11: «Guardar y publicar»: el precio va a la cola de MercadoLibre (Publicaciones → Tareas).
      if (over?.publicar) {
        const r = await fetch('/api/publicaciones/lotes', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tipo: 'precio', seleccion: { items: pubsML }, modo: 'fijo', valor: over.publicar, redondeo: 'no', confirmar: true }) })
        const d = await r.json().catch(() => ({}))
        if (!r.ok) { setError(`Se guardó el producto, pero el precio no se mandó a MercadoLibre: ${d.error ?? 'error'}`); setForm(f => ({ ...f, sale_price: salePrice })); setSimPct(null); return }
        window.dispatchEvent(new Event('cola-ml'))
      }

      // refresh product list
      const listRes = await fetch('/api/products')
      setProducts(await listRes.json())

      if (keepOpen && modal === 'create') {
        const created = form.code
        // reset form + fetch next code for the following product
        const codeRes = await fetch('/api/products/next-code')
        const codeData = await codeRes.json()
        setForm({ ...emptyForm(), code: codeData.next_code ?? codeData.code })
        setOkMsg(`Producto ${created} creado. Listo para el siguiente.`)
        setTimeout(() => setOkMsg(''), 3000)
      } else {
        closeModal()
      }
    } finally {
      setSaving(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, modal, editId, basePriceUsd, publishedPriceUsd, finalPriceUsd, pubsML.join(','), conVariantes])

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
    const pct = parseFloat(batchPct.replace(',', '.'))
    if (isNaN(pct) || pct < 0 || pct > 200 || selected.length === 0) return
    let res: Response
    if (country === 'VE' && veRate) {
      // VE: además de la categoría, recalcula y guarda los precios (base, publicado,
      // final, Bs y el precio de inventario). Antes solo cambiaba la categoría: el
      // catálogo se veía bien porque calcula en vivo, pero ventas, reportes y la hoja
      // de inventario seguían leyendo el precio viejo guardado.
      const items = products.filter(p => selected.includes(p.id)).map(p => {
        const q = { ...p, profit_percentage: pct }
        return {
          product_id: p.id,
          ganancia_pct: pct,
          ...storedPricesVE(p.total_cost, pct, veRate.excess ?? 0, effDiscountFor(q), veRate.official),
        }
      })
      res = await fetch('/api/products/reprice', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      })
    } else {
      // CO: los precios guardados en USD no se usan (el de venta en pesos es manual).
      res = await fetch('/api/products/batch-category', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_ids: selected, ganancia_pct: pct }),
      })
    }
    if (!res.ok) { alert('Error al cambiar el recargo'); return }
    const listRes = await fetch('/api/products')
    setProducts(await listRes.json())
    setSelected([])
    setBatchPct('')
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

  type SortKey = 'code' | 'name' | 'category' | 'cost' | 'price' | 'mlprice' | 'margin' | 'peso' | 'stock' | 'status'
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
    const margin = (p: Product) => netDe(p, effDiscountFor(p))?.rentabilidad ?? -Infinity
    const valueFor = (p: Product): number | string => {
      switch (sortKey) {
        case 'code':     return p.code
        case 'name':     return p.name.toLowerCase()
        case 'category': return gananciaDe(p) ?? -Infinity
        case 'cost':     return p.total_cost
        case 'price':    return country === 'CO' ? p.sale_price : precioVE(p)
        case 'mlprice':  return publicadoVE(p)
        case 'margin':   return margin(p)
        case 'peso':     return p.weight_kg ?? -Infinity
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
  }, [filtered, sortKey, sortDir, country, veRate, coTrm, mlSettings, globalDiscount, shipTable, simple])

  const isSearching = search.trim().length > 0
  const displayed   = isSearching ? sorted : sorted.slice(0, visible)
  const hasMore     = !isSearching && sorted.length > visible
  const filteredIds = sorted.map(p => p.id)

  // ── catalog KPIs ──
  const kpis = {
    total:       products.length,
    activos:     products.filter(p => p.is_active).length,
    inactivos:   products.filter(p => !p.is_active).length,
    sinCat:      products.filter(p => p.is_active && (simple ? !(p.total_cost > 0) : gananciaDe(p) == null)).length,
    valor:       products.filter(p => p.is_active).reduce((s, p) => s + p.quantity * p.total_cost, 0),
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Productos" subtitle="Catálogo, precios y rentabilidad de cada producto" actions={<>
        {/* 14-11 (el dueño): Importar desde ML vive en Productos (es donde se crean); MercadoEnvíos sigue en Publicaciones. */}
        {importarML && products.length > 0 && (
          <Link href="/productos/importar-ml" className="btn-secondary text-sm whitespace-nowrap"
            title="Crear productos a partir de tus publicaciones de MercadoLibre (o vincular las que ya tienes)">
            Importar desde ML
          </Link>
        )}
        {country === 'VE' && descuento && (
          <Link href="/productos/margenes" className="btn-secondary text-sm whitespace-nowrap"
            title="Productos de menos de $5: rentabilidad antes y después de la tabla nueva de envíos, con sugerencia de recargo">
            Márgenes &lt; $5
          </Link>
        )}
        {costosML && <button onClick={() => setVerCostos(true)} className="btn-secondary text-sm whitespace-nowrap" title="Comisión de MercadoLibre, envío y colores de la rentabilidad">Costos ML</button>}
        {catalogo && <Link href="/productos/catalogo" className="btn-secondary text-sm whitespace-nowrap" title="Catálogo con logo, fotos y precios para mandar por WhatsApp">Catálogo PDF</Link>}
        <button onClick={openCreate} className="btn-primary text-sm whitespace-nowrap">+ Producto</button>
      </>} />

      {/* Catálogo vacío (25-10): el primer paso de quien recién prende inventario es traer sus publicaciones. */}
      {importarML && products.length === 0 && (
        <div className="rounded-xl border border-lime-300 bg-lime-50 p-5 sm:flex sm:items-center sm:gap-6">
          <div className="flex-1">
            <div className="text-lg font-semibold text-neutral-900">Empieza trayendo tus publicaciones de MercadoLibre</div>
            <p className="mt-1 text-sm text-neutral-600">
              Cada publicación (o cada color/modelo) queda como un producto, ya vinculado: así cada venta de ML descuenta
              el producto correcto. Después solo revisas el stock y el costo.
            </p>
          </div>
          <Link href="/productos/importar-ml" className="btn-primary mt-3 inline-block whitespace-nowrap sm:mt-0">Importar desde MercadoLibre</Link>
        </div>
      )}

      {/* KPI header */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KPICard compact label="Productos" value={int(kpis.total)} />
        <KPICard compact label="Activos" value={int(kpis.activos)} />
        <KPICard compact label="Inactivos" value={int(kpis.inactivos)} tone={kpis.inactivos > 0 ? 'apagado' : 'neutro'} />
        <KPICard compact label={simple ? 'Sin costo' : 'Sin recargo'} value={int(kpis.sinCat)} tone={kpis.sinCat > 0 ? 'atencion' : 'neutro'} />
        <KPICard compact label="Valor catálogo (costo)" value={`$${fmt(kpis.valor)}`} />
      </div>

      {/* ── barra: búsqueda + acciones en lote ── */}
      <div className="flex flex-wrap items-center gap-3">

        {selected.length > 0 && !simple && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-neutral-500">{selected.length} seleccionados</span>
            <label className="flex items-center gap-1 text-sm text-neutral-600">
              Recargo
              <input type="number" min={0} max={200} step={0.5} value={batchPct} onChange={e => setBatchPct(e.target.value)} placeholder="60"
                className="w-20 border border-neutral-300 rounded-lg px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-neutral-800" />%
            </label>
            <button
              onClick={handleBatch}
              disabled={batchPct.trim() === '' || isNaN(parseFloat(batchPct)) || parseFloat(batchPct) < 0 || parseFloat(batchPct) > 200}
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
          className="border border-neutral-300 rounded-lg px-3 py-2 text-sm w-full md:w-72 order-first"
        />
      </div>

      {/* ── table (desktop) ── */}
      <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto hidden md:block">
          <table className="w-full text-sm [&_th]:whitespace-nowrap">
            <thead className="text-xs">
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
                <th onClick={() => toggleSort('category')} title={simple ? 'Recargo de tu precio publicado sobre el costo (lo que le sumaste)' : 'Recargo sobre costo: lo que le sumas al costo para el precio'}
                  className="px-3 py-2 text-right font-medium text-neutral-500 cursor-pointer select-none hover:text-neutral-800">
                  Recargo{sortArrow('category')}
                </th>
                <th onClick={() => toggleSort('cost')}
                  className="px-3 py-2 text-right font-medium text-neutral-500 cursor-pointer select-none hover:text-neutral-800">
                  Costo{sortArrow('cost')}
                </th>
                <th onClick={() => toggleSort('price')}
                  className="px-3 py-2 text-right font-medium text-neutral-500 cursor-pointer select-none hover:text-neutral-800">
                  Precio{sortArrow('price')}
                </th>
                {country === 'VE' && !simple && (
                  <th onClick={() => toggleSort('mlprice')}
                    className="px-3 py-2 text-right font-medium text-neutral-500 cursor-pointer select-none hover:text-neutral-800"
                    title="Precio publicado en ML (con exceso, antes del descuento)">
                    Precio ML{sortArrow('mlprice')}
                  </th>
                )}
                <th onClick={() => toggleSort('margin')} title={AYUDA_RENTABILIDAD}
                  className="px-3 py-2 text-right font-medium text-neutral-500 cursor-pointer select-none hover:text-neutral-800">
                  Rentabilidad{sortArrow('margin')}
                </th>
                {country === 'VE' && (
                  <th onClick={() => toggleSort('peso')}
                    className="px-3 py-2 text-right font-medium text-neutral-500 cursor-pointer select-none hover:text-neutral-800"
                    title="Peso del portal de MercadoEnvíos (ML) o cargado a mano">
                    Peso ME{sortArrow('peso')}
                  </th>
                )}
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
                  <td colSpan={simple ? (country === 'VE' ? 11 : 10) : country === 'VE' ? 12 : 10} className="px-3 py-8 text-center text-neutral-400">
                    {search ? 'Sin resultados' : 'No hay productos'}
                  </td>
                </tr>
              )}
              {displayed.map(p => {
                const net = netDe(p, effDiscountFor(p))
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
                  <td className="px-3 py-2 font-mono text-xs text-neutral-500 whitespace-nowrap">{p.code}</td>
                  <td className="px-3 py-1.5 font-medium text-neutral-900"><div className="flex items-center gap-2"><FotoProducto id={p.id} nombre={p.name} />{p.name}</div></td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {(() => { const g = gananciaDe(p); return g == null ? <span className="text-neutral-300">—</span>
                      : <span className="text-xs bg-neutral-100 text-neutral-700 px-2 py-0.5 rounded-full">{fmtPct(g)}</span> })()}
                  </td>
                  <td className="px-3 py-2 text-right text-neutral-600">${fmt(p.total_cost)}</td>
                  <td className="px-3 py-2 text-right font-medium text-neutral-900">
                    {country === 'CO' ? `$${fmtPeso(p.sale_price)}` : `$${fmt(precioVE(p))}`}
                  </td>
                  {country === 'VE' && !simple && (
                    <td className="px-3 py-2 text-right font-medium text-neutral-900 num">
                      ${fmt(publicadoVE(p))}
                    </td>
                  )}
                  <td className="px-3 py-2 text-right">
                    {net ? (
                      <span className={`font-medium ${netColor(net.rentabilidad, umbr)}`}>
                        {Math.round(net.rentabilidad)}%
                      </span>
                    ) : <span className="text-neutral-300">—</span>}
                  </td>
                  {country === 'VE' && <td className="px-3 py-2 text-right whitespace-nowrap"><PesoME p={p} /></td>}
                  <td className="px-3 py-2 text-right text-neutral-600">{p.quantity}</td>
                  <td className="px-3 py-2 text-center">
                    <StatusBadge status={p.is_active ? 'OK' : 'INACTIVO'} label={p.is_active ? 'Activo' : 'Inactivo'} />
                  </td>
                  <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                    <div className="flex justify-end">
                      <RowMenu items={[
                        { label: 'Editar', onClick: () => openEdit(p.id) },
                        { label: p.is_active ? 'Desactivar' : 'Activar', onClick: () => handleStatus(p.id, p.is_active ? 'deactivate' : 'activate') },
                        { label: 'Eliminar', danger: true, onClick: () => handleStatus(p.id, 'delete') },
                      ]} />
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
            const net = netDe(p)
            return (
              <div key={p.id} onClick={() => openView(p.id)} className="px-4 py-3 cursor-pointer active:bg-neutral-50">
                <div className="flex items-start justify-between gap-2">
                  <FotoProducto id={p.id} nombre={p.name} tam="md" />
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-xs text-neutral-400">{p.code}</div>
                    <div className="font-medium text-neutral-900 truncate">{p.name}</div>
                    {gananciaDe(p) != null && (
                      <span className="inline-block mt-1 text-xs bg-neutral-100 px-2 py-0.5 rounded-full">Recargo {fmtPct(gananciaDe(p)!)}</span>
                    )}
                  </div>
                  <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${p.is_active ? 'bg-green-50 text-green-700' : 'bg-neutral-100 text-neutral-400'}`}>
                    {p.is_active ? 'Activo' : 'Inactivo'}
                  </span>
                </div>
                <div className="flex items-center gap-4 mt-2 text-sm">
                  <span className="text-neutral-500">Precio: <span className="font-medium text-neutral-900">{country === 'CO' ? `$${fmtPeso(p.sale_price)}` : `$${fmt(precioVE(p))}`}</span></span>
                  {country === 'VE' && !simple && (
                    <span className="text-neutral-500">ML: <span className="font-medium text-neutral-900">${fmt(publicadoVE(p))}</span></span>
                  )}
                  {country === 'VE' && <span className="text-neutral-500">Peso: <PesoME p={p} /></span>}
                  {net && (
                    <span className={netColor(net.rentabilidad, umbr)}>Rentab. {Math.round(net.rentabilidad)}%</span>
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
                {modal === 'create' ? 'Nuevo producto' : 'Editar producto'}
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
                <p className="text-sm font-semibold text-neutral-800">Calculadora de precios</p>

                {/* costo / envío / total */}
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-neutral-600 mb-1">Costo ($)</label>
                    <NumberInput
                      min="0" step="0.01"
                      value={form.base_cost}
                      onValueChange={n => setForm(f => ({ ...f, base_cost: n }))}
                      className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm
                                 focus:outline-none focus:ring-2 focus:ring-neutral-800"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-600 mb-1">Envío ($)</label>
                    <NumberInput
                      min="0" step="0.01"
                      value={form.shipping_cost}
                      onValueChange={n => setForm(f => ({ ...f, shipping_cost: n }))}
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

                {/* categoría (Inventario simple: no hay; el precio es lo publicado) */}
                {simple ? (
                  <div className="rounded-lg border-2 border-green-400 bg-green-50 p-3">
                    <label className="mb-1 block text-[11px] font-medium text-green-700">
                      Precio de venta {country === 'CO' ? '(pesos)' : '(USD)'} · lo que publicas en MercadoLibre
                    </label>
                    {country === 'CO' ? (
                      <input type="text" inputMode="numeric" value={form.sale_price ? fmtPeso(form.sale_price) : ''}
                        onChange={e => {
                          const digits = e.target.value.replace(/\D/g, '')
                          setForm(f => ({ ...f, sale_price: digits ? parseInt(digits, 10) : 0 }))
                        }}
                        placeholder="0"
                        className="w-full rounded-lg border border-green-300 bg-white px-3 py-2 text-xl font-bold text-green-700 focus:outline-none focus:ring-2 focus:ring-green-500" />
                    ) : (
                      <NumberInput min="0" step="0.01" value={form.sale_price}
                        onValueChange={n => setForm(f => ({ ...f, sale_price: n }))}
                        className="w-full rounded-lg border border-green-300 bg-white px-3 py-2 text-xl font-bold text-green-700 focus:outline-none focus:ring-2 focus:ring-green-500" />
                    )}
                    {country === 'VE' && form.sale_price > 0 && (veRate?.official ?? 0) > 0 && (
                      <p className="mt-1 text-[10px] text-neutral-500">≈ Bs {fmt(form.sale_price * (veRate?.official ?? 0))} a la tasa oficial</p>
                    )}
                  </div>
                ) : (
                  <MedidorGanancia valor={form.ganancia_pct} onChange={n => setForm(f => ({ ...f, ganancia_pct: n }))} nivel={nivelForm}
                    ayuda={totalCost > 0 ? <>Precio de venta = costo × {(1 + profitPct / 100).toLocaleString('de-DE', { maximumFractionDigits: 3 })} = <b>${fmt(basePriceUsd)}</b>. El color es la rentabilidad: lo que de verdad te queda después de MercadoLibre.</> : 'Pon el costo para ver el precio.'}>
                    {puedePublicar && (
                      <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-black/5 pt-2">
                        <button type="button" onClick={() => handleSave(false, { publicar: precioParaML })} disabled={saving}
                          className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-neutral-700 disabled:opacity-50">
                          Guardar y publicar {country === 'CO' ? `$${fmtPeso(precioParaML)}` : `$${fmt(precioParaML)}`} en ML
                        </button>
                        <span className="text-[11px] text-neutral-500">{pubsML.length === 1 ? '1 publicación vinculada' : `${pubsML.length} publicaciones vinculadas`}</span>
                      </div>
                    )}
                  </MedidorGanancia>
                )}
                {simple && costoForm > 0 && (
                  <MedidorGanancia valor={simPct ?? (pctReal != null ? Math.max(0, Math.round(pctReal * 10) / 10) : null)}
                    onChange={n => setSimPct(n)} nivel={nivelForm}
                    ayuda={simulando
                      ? <>Para un recargo de <b>{fmtPct(simPct!)}</b> publica a <b>{country === 'CO' ? `$${fmtPeso(precioSim)}` : `$${fmt(precioSim)}`}</b> (hoy {country === 'CO' ? `$${fmtPeso(form.sale_price)}` : `$${fmt(form.sale_price)}`}{pctReal != null ? `, ${fmtPct(pctReal)}` : ''}). Abajo ves lo que te quedaría.</>
                      : <>Hoy tu precio lleva {pctReal != null ? <b>{fmtPct(pctReal)}</b> : '—'} de recargo sobre el costo. Mueve la barra para ver a qué precio ganarías más o menos.</>}>
                    {simulando && precioSim !== form.sale_price && (
                      <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-black/5 pt-2">
                        <button type="button" onClick={() => { setForm(f => ({ ...f, sale_price: precioSim })); setSimPct(null) }}
                          className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-800 hover:bg-neutral-50">
                          Usar este precio
                        </button>
                        {puedePublicar && (
                          <button type="button" onClick={() => handleSave(false, { salePrice: precioSim, publicar: precioSim })} disabled={saving}
                            className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-neutral-700 disabled:opacity-50">
                            Guardar y publicar en ML
                          </button>
                        )}
                        <button type="button" onClick={() => setSimPct(null)} className="text-[11px] text-neutral-500 hover:underline">Volver al de hoy</button>
                      </div>
                    )}
                    {!simulando && puedePublicar && (
                      <p className="mt-1 text-[10px] text-neutral-400">Al mover la barra puedes publicar el precio nuevo en MercadoLibre desde aquí.</p>
                    )}
                  </MedidorGanancia>
                )}

                {/* Precios calculados (organización estilo legacy) */}
                <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-3 space-y-3">
                  {!simple && <p className="text-sm font-semibold text-neutral-700">Precios calculados</p>}

                  {!simple && <div className="grid grid-cols-2 gap-2">
                    {/* Costo Base */}
                    <div className="bg-white border border-neutral-200 rounded-lg p-2.5">
                      <p className="text-[11px] text-neutral-500">Costo Base (Costo + Envío)</p>
                      <p className="text-lg font-bold text-neutral-800">${fmt(totalCost)}</p>
                    </div>
                    {/* Precio Base = precio que se registra en la venta (inventario) */}
                    <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-2.5">
                      <p className="text-[11px] text-neutral-500 font-medium">Precio de venta (va a Ventas)</p>
                      <p className="text-lg font-bold text-neutral-900">${fmt(basePriceUsd)}</p>
                      <p className="text-[10px] text-neutral-400">Costo Base × {(1 + profitPct / 100).toFixed(2)}</p>
                    </div>

                    {country === 'VE' && (
                      <>
                        {/* Precio Exceso ML */}
                        <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-2.5">
                          <p className="text-[11px] text-neutral-500">Precio con exceso ML ({veRate?.excess ?? 0}%)</p>
                          <p className="text-lg font-bold text-neutral-900">${fmt(suggestedMl)}</p>
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
                  </div>}

                  {country === 'VE' ? (
                    <>
                      {/* MercadoEnvíos + Descuento (VE) */}
                      <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-2.5 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <label className="text-xs font-medium text-neutral-700">Peso (kg) <span className="text-neutral-400">· MercadoEnvíos</span></label>
                          {form.peso_ml ? (
                            <span className="text-sm" title="Peso del portal de MercadoEnvíos: se actualiza solo">{form.weight_kg} <span className="rounded bg-sky-50 px-1 text-[10px] font-semibold text-sky-700">ML</span></span>
                          ) : <input type="number" step="0.001" min="0" value={form.weight_kg}
                            onChange={e => setForm(f => ({ ...f, weight_kg: e.target.value }))}
                            placeholder="ej. 0.350"
                            className="w-28 border border-neutral-300 rounded px-2 py-1 text-sm text-right
                                       focus:outline-none focus:ring-2 focus:ring-neutral-800" />}
                        </div>
                        {!form.peso_ml && form.pesos_ml && (
                          <ElegirPesoML pesos={form.pesos_ml} actual={form.weight_kg}
                            onElegir={kg => setForm(f => ({ ...f, weight_kg: String(kg) }))} />
                        )}
                        {descuento && !simple ? <>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-neutral-700">Descuento ML (global): <b>{globalDiscount.toFixed(1)}%</b></span>
                            <span className="text-[11px] text-neutral-500">Rec: {recDiscountLive.toFixed(1)}%</span>
                          </div>
                          <div className={`text-[11px] px-2 py-1 rounded border ${shipBadge(formShip).cls}`}>
                            {shipBadge(formShip).label}
                            {formShip.status === 'capped' && (
                              <span className="block text-neutral-500">Se aplica {formEffDiscount.toFixed(1)}% (no {globalDiscount.toFixed(1)}%) para no perder envío gratis.</span>
                            )}
                          </div>
                          <p className="text-[10px] text-neutral-400">Descuento global en Ajustes; el peso limita cuánto se aplica sin perder envío gratis.</p>
                        </> : (
                          <p className="text-[10px] text-neutral-400">
                            El peso define cuánto te cobra MercadoLibre por el envío, y eso se descuenta de tu ganancia.
                          </p>
                        )}
                      </div>

                    </>
                  ) : simple ? null : (
                    /* Colombia — costo USD, precio de venta en PESOS (sugerido por TRM) */
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-2.5">
                          <p className="text-[11px] text-neutral-500 font-medium">Precio base (USD)</p>
                          <p className="text-lg font-bold text-neutral-900">${fmt(basePriceUsd)}</p>
                          <p className="text-[10px] text-neutral-400">Costo × {(1 + profitPct / 100).toFixed(2)}</p>
                        </div>
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                          <p className="text-[11px] text-amber-700 font-medium">Sugerido a publicar</p>
                          <p className="text-lg font-bold text-amber-700">${fmtPeso(suggestedPesos)}</p>
                          <p className="text-[10px] text-neutral-400">
                            Te deja ${fmtPeso(Math.round(basePriceUsd * coTrm))} tras ML
                          </p>
                        </div>
                      </div>
                      {/* Precio de venta real (lo que publicas en ML), en pesos */}
                      <div className="bg-green-50 border-2 border-green-400 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[11px] text-green-700 font-medium">Precio publicado en ML (pesos)</label>
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
                    <p className="text-sm font-semibold text-neutral-700 mb-2">Lo que te queda{simulando && <span className="ml-1 text-xs font-normal text-sky-700">· con el precio que estás probando</span>}</p>
                    <MlBreakdown
                      country={country}
                      totalCost={totalCost}
                      ml={mlSettings}
                      finalPriceUsd={simple ? precioSim : finalPriceUsd}
                      weightKg={formWeight != null && !isNaN(formWeight) ? formWeight : null}
                      veRate={veRate}
                      priceBs={simple ? precioSim * (veRate?.official ?? 0) : priceBs}
                      salePrice={simple ? precioSim : form.sale_price || suggestedPesos}
                      coTrm={coTrm}
                      recargo={simple ? (simulando ? simPct : pctReal) : form.ganancia_pct}
                    />
                  </div>
                </div>
              </div>

              {/* Nota del precio de venta de inventario */}
              <p className="text-xs text-neutral-400 -mt-1">
                {simple
                  ? <>El <b>precio de venta</b> se guarda tal cual: es lo que publicas en MercadoLibre. El costo, lo que pagaste.</>
                  : country === 'CO'
                  ? <>El <b>costo</b> se guarda en USD y el <b>precio de venta</b> en pesos (${fmtPeso(form.sale_price)}).</>
                  : <>El precio de venta de inventario se guarda igual al <b>Precio Base</b> (${fmt(basePriceUsd)}).</>}
              </p>

              {/* Publicaciones de ML: solo lectura, se vinculan en Publicaciones → Vincular (13-11) */}
              <div className="border border-neutral-200 rounded-xl p-4 space-y-2">
                <p className="text-sm font-semibold text-neutral-800">Publicaciones de MercadoLibre</p>
                <VinculosML codes={form.ml_codes} productCode={form.code} creando={modal === 'create'} />
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
        const vEff  = effDiscountFor(v)
        const vShip = country === 'VE' ? shipFor(v) : null
        const net = netDe(v, vEff)
        // Precio que efectivamente se cobra en ML: el guardado (simple) o el calculado con descuento.
        const vFinal = simple ? v.sale_price : liveFinalVE(v, veRate?.excess ?? 0, vEff)
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
                    {gananciaDe(v as unknown as Product) != null && (
                      <span className="text-xs bg-neutral-100 px-2 py-0.5 rounded-full">Recargo {fmtPct(gananciaDe(v as unknown as Product)!)}</span>
                    )}
                  </div>
                </div>
                <button onClick={closeView} className="text-neutral-400 hover:text-neutral-700 text-lg">✕</button>
              </div>
              {/* 13-11 (mig. 173): la foto del producto (propia o de MercadoLibre) y cambiarla. */}
              <div className="px-6 py-3 border-b border-neutral-100 shrink-0">
                <FotoEditable id={v.id} nombre={v.name} puedeCambiar />
              </div>

              {/* body */}
              <div className="px-6 py-4 space-y-4 flex-1 overflow-y-auto text-sm">
                <div>
                  <p className="text-sm font-semibold text-neutral-800 mb-2">Costos</p>
                  <div className="grid grid-cols-3 gap-2">
                    <Field label="Costo" value={`$${fmt(v.base_cost)}`} />
                    <Field label="Envío" value={`$${fmt(v.shipping_cost)}`} />
                    <Field label="Costo total" value={`$${fmt(v.total_cost)}`} />
                  </div>
                </div>

                <div>
                  <p className="text-sm font-semibold text-neutral-800 mb-2">Precios</p>
                  {country === 'VE' && simple ? (
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="Precio de venta (publicado)" value={`$${fmt(v.sale_price)}`} accent="text-neutral-900" />
                      <Field label="Precio Bs" value={`Bs ${fmt(v.sale_price * (veRate?.official ?? 0))}`} />
                      {net && (
                        <Field label="Rentabilidad" value={`${Math.round(net.rentabilidad)}%`} accent={netColor(net.rentabilidad, umbr)} />
                      )}
                    </div>
                  ) : country === 'VE' ? (
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="Precio base (a Ventas)" value={`$${fmt(liveBaseVE(v))}`} accent="text-neutral-900" />
                      <Field label="Precio publicado" value={`$${fmt(liveBaseVE(v) * (1 + (veRate?.excess ?? 0) / 100))}`} />
                      {descuento && <>
                        <Field label="Descuento aplicado" value={`${fmt(vEff)}%`} />
                        <Field label="Venta c/ descuento (ML)" value={`$${fmt(liveFinalVE(v, veRate?.excess ?? 0, vEff))}`} accent="text-green-700" />
                      </>}
                      <Field label="Precio Bs" value={`Bs ${fmt(liveFinalVE(v, veRate?.excess ?? 0, vEff) * (veRate?.official ?? 0))}`} />
                      {net && (
                        <Field label="Rentabilidad" value={`${Math.round(net.rentabilidad)}%`} accent={netColor(net.rentabilidad, umbr)} />
                      )}
                    </div>
                  ) : (
                    /* CO: el precio de venta está en pesos (sección Inventario); aquí el análisis en USD */
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="Precio venta ≈ USD" value={coTrm > 0 ? `$${fmt(v.sale_price / coTrm)}` : '—'} accent="text-green-700" />
                      {net && (
                        <Field label="Rentabilidad" value={`${Math.round(net.rentabilidad)}%`} accent={netColor(net.rentabilidad, umbr)} />
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <p className="text-sm font-semibold text-neutral-800 mb-2">Lo que te queda</p>
                  <MlBreakdown
                    country={country}
                    totalCost={v.total_cost}
                    ml={mlSettings}
                    finalPriceUsd={vFinal}
                    weightKg={v.weight_kg}
                    veRate={veRate}
                    priceBs={vFinal * (veRate?.official ?? 0)}
                    salePrice={v.sale_price}
                    coTrm={coTrm}
                    recargo={gananciaDe(v as unknown as Product)}
                  />
                </div>

                {country === 'VE' && vShip && (
                  <div>
                    <p className="text-sm font-semibold text-neutral-800 mb-2">MercadoEnvíos</p>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <label className="text-xs text-neutral-600">Peso (kg)</label>
                        {viewing.peso_origen === 'ml' ? (
                          <span className="text-sm" title="Peso del portal de MercadoEnvíos: se actualiza solo">{viewing.weight_kg} <span className="rounded bg-sky-50 px-1 text-[10px] font-semibold text-sky-700">ML</span></span>
                        ) : <div className="flex items-center gap-1">
                          <input type="number" step="0.001" min="0" value={viewWeight}
                            onChange={e => setViewWeight(e.target.value)}
                            placeholder="ej. 0.350"
                            className="w-24 border border-neutral-300 rounded px-2 py-1 text-sm text-right
                                       focus:outline-none focus:ring-2 focus:ring-neutral-800" />
                          <button onClick={saveViewWeight} disabled={savingWeight}
                            className="text-xs px-2 py-1 rounded bg-neutral-900 text-white hover:bg-neutral-700 disabled:opacity-50">
                            {savingWeight ? '…' : '✓'}
                          </button>
                        </div>}
                      </div>
                      {viewing.peso_origen !== 'ml' && viewing.pesos_ml && (
                        <ElegirPesoML pesos={viewing.pesos_ml} actual={viewWeight} onElegir={kg => setViewWeight(String(kg))} />
                      )}
                      <div className={`text-[11px] px-2 py-1.5 rounded border ${shipBadge(vShip).cls}`}>
                        {shipBadge(vShip).label}
                      </div>
                      {vShip.tier && (
                        <div className="grid grid-cols-2 gap-2">
                          <Field label="Umbral envío gratis" value={`$${fmt(vShip.tier.minPrice)}`} />
                          <Field label="Desc. máx sin perderlo" value={vShip.maxDiscount != null ? `${vShip.maxDiscount.toFixed(1)}%` : '—'} accent={vShip.status === 'capped' ? 'text-amber-700' : undefined} />
                        </div>
                      )}
                      {vShip.status === 'capped' && (
                        <p className="text-[11px] text-amber-700">Se aplica {fmt(vEff)}% en vez del global {fmt(globalDiscount)}% para no perder el envío gratis.</p>
                      )}
                    </div>
                  </div>
                )}

                <div>
                  <p className="text-sm font-semibold text-neutral-800 mb-2">Inventario</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Stock" value={int(v.quantity)} accent={v.quantity > 0 ? 'text-neutral-900' : 'text-red-600'} />
                    <Field label="Precio de venta" value={country === 'CO' ? `$${fmtPeso(v.sale_price)}` : `$${fmt(v.sale_price)}`} accent={country === 'CO' ? 'text-green-700' : undefined} />
                  </div>
                </div>

                <div>
                  <p className="text-sm font-semibold text-neutral-800 mb-2">Publicaciones de MercadoLibre</p>
                  <VinculosML codes={v.ml_codes} productCode={v.code} />
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
      {verCostos && <CostosMLModal country={country} ml={mlSettings} onCerrar={() => setVerCostos(false)} onGuardado={nuevo => setMlSettings(m => ({ ...m, ...nuevo }))} />}
    </div>
  )
}

/** Columna «Peso ME» (14-11, el dueño): el peso del producto y de dónde sale, para saber si está al día con MercadoEnvíos.
 *  ML = del portal (con la fecha en que se leyó) · a mano · pesos distintos en ML (pack o vínculo a revisar) · sin peso. */
function PesoME({ p }: { p: Product }) {
  const kg = p.weight_kg != null && p.weight_kg > 0 ? `${p.weight_kg.toLocaleString('de-DE', { maximumFractionDigits: 3 })} kg` : null
  if (p.pesos_ml?.length) return (
    <span className="text-amber-700" title={`Sus publicaciones pesan distinto en MercadoEnvíos (${p.pesos_ml.map(x => x.toLocaleString('de-DE')).join(' / ')} kg): revísalo en Publicaciones → MercadoEnvíos`}>
      {kg ?? '—'} <span className="rounded bg-amber-50 px-1 text-[10px] font-semibold">⚠ distintos</span>
    </span>)
  if (p.peso_origen === 'ml' && kg) return (
    <span className="text-neutral-800" title={`Del portal de MercadoEnvíos${p.peso_me_at ? ` · leído el ${p.peso_me_at}` : ''}: se actualiza solo`}>
      {kg} <span className="rounded bg-sky-50 px-1 text-[10px] font-semibold text-sky-700">ML</span>
    </span>)
  if (kg) return <span className="text-neutral-600" title="Cargado a mano: no viene del portal de MercadoEnvíos">{kg} <span className="text-[10px] text-neutral-400">a mano</span></span>
  return <span className="text-[11px] text-neutral-400" title="Sin peso: no está en el portal de MercadoEnvíos ni cargado a mano">Sin peso</span>
}
