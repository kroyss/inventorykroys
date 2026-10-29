'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Sale } from '@/lib/types'
import {
  bs, calcInvoice, normalizeDoc, round2, MAX_INVOICE_LINES,
  type Invoice, type InvoiceCustomer, type Membrete,
} from '@/lib/invoices'
import { Combobox } from '@/components/ui/Combobox'
import NumberInput from '@/components/ui/NumberInput'
import { DateField } from '@/components/ui/DateField'
import { FacturaVista } from './FacturaPrint'
import { useImprimirFactura } from './ImprimirAqui'

interface Line {
  product_id: number | null
  description: string
  quantity: number
  unit_price_usd: number
}

interface Props {
  /** Facturar una venta (los datos de ML vienen de borrador). */
  sale?: Sale
  /** Reimprimir en hoja nueva: anula esta factura y emite otra con el siguiente número. */
  replaces?: Invoice
  /** Corregir con el MISMO número (la hoja preimpresa todavía está en blanco). */
  edita?: Invoice
  onClose: () => void
  onSaved: (inv: Invoice) => void
}

/** Lo que se autoguarda mientras se llena "Facturar venta" (invoice_drafts.data). */
interface Draft {
  control: string
  date: string
  rate: number
  rateTouched: boolean
  name: string
  doc: string
  address: string
  phone: string
  isSpecial: boolean
  retPct: number
  withIva: boolean
  ivaRate: number
  lines: Line[]
  otras?: VentaAgrupable[]
}

/** Otra venta que va en la misma hoja (GET /api/invoices/agrupables, mig 114). */
interface VentaAgrupable {
  id: number; ml_order_number: string; customer_name: string; created_at: string
  discount_percent: number; total_amount: number
  items: { product_id: number; product_name: string; product_code: string; quantity: number; unit_price: number }[]
}

interface DatosGuia {
  carrier: 'ZOOM' | 'TEALCA'
  documento: string | null; telefono: string | null; ciudad: string | null; direccion: string | null
}
const dirCompleta = (g: DatosGuia) => [g.direccion, g.ciudad].filter(Boolean).join(', ')
interface DraftResp { data: Partial<Draft>; updated_at: string; updated_by: string | null }

const saleLines = (sale?: Sale): Line[] => {
  const disc = sale?.discount_percent ?? 0
  return (sale?.items ?? []).map(i => ({
    product_id: i.product_id, description: i.product_name, quantity: i.quantity,
    unit_price_usd: round2(i.unit_price * (1 - disc / 100)),
  }))
}

/** Líneas de varias ventas: el mismo producto va en UNA línea con la cantidad sumada (23-10: con precios distintos
 *  entre ventas salían varias líneas del mismo producto y se llegaba al tope de 7). El precio es el promedio, con 4
 *  decimales para que el total cuadre con lo vendido. Sin otras ventas, las líneas de siempre. */
const juntarLineas = (sale: Sale | undefined, otras: VentaAgrupable[]): Line[] => {
  if (!otras.length) return saleLines(sale)
  const todas = [...saleLines(sale), ...otras.flatMap(v => saleLines(v as unknown as Sale))]
  const out: (Line & { totalUsd: number })[] = []
  for (const l of todas) {
    const igual = l.product_id != null && out.find(o => o.product_id === l.product_id)
    if (igual) { igual.quantity += l.quantity; igual.totalUsd += l.quantity * l.unit_price_usd }
    else out.push({ ...l, totalUsd: l.quantity * l.unit_price_usd })
  }
  return out.map(({ totalUsd, ...l }) => ({ ...l, unit_price_usd: Math.round(totalUsd / l.quantity * 10000) / 10000 }))
}
const resumenItems = (v: VentaAgrupable) => v.items.map(i => `${i.quantity}× ${i.product_name}`).join(', ')

const hhmm = (iso: string) => new Date(iso).toLocaleString('es-VE', {
  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
})

interface ConfigResp {
  next_number: number
  iva: number
  today: string
  rate: number | null
  rate_date: string | null
  membrete: Membrete | null
}

const inputCls = 'mt-1 w-full border border-neutral-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-800'

export default function FacturaForm({ sale, replaces, edita, onClose, onSaved }: Props) {
  // De dónde salen los datos al corregir: la factura que se anula (número nuevo) o la que se edita (mismo número).
  const fuente = replaces ?? edita
  const [config, setConfig]   = useState<ConfigResp | null>(null)
  const [customers, setCustomers] = useState<InvoiceCustomer[]>([])
  const [error, setError]     = useState<string | null>(null)
  const [busy, setBusy]       = useState(false)
  const [saved, setSaved]     = useState<Invoice | null>(null)

  // Encabezado
  const [number, setNumber]   = useState(0)
  const [control, setControl] = useState('')
  const [date, setDate]       = useState('')
  const [rate, setRate]       = useState(0)
  const [rateDate, setRateDate] = useState<string | null>(null)
  const [rateTouched, setRateTouched] = useState(!!fuente)

  // Cliente: borrador desde la venta (nombre de ML) o desde la factura que se reemplaza
  const draftName = fuente?.customer_name ?? sale?.customer_name ?? ''
  const [name, setName]       = useState(draftName)
  const [doc, setDoc]         = useState(fuente?.customer_doc ?? '')
  const [address, setAddress] = useState(fuente?.customer_address ?? '')
  const [phone, setPhone]     = useState(fuente?.customer_phone ?? '')
  const [isSpecial, setIsSpecial] = useState(fuente?.is_special ?? false)
  const [retPct, setRetPct]   = useState(fuente?.retention_percent || 75)
  const [search, setSearch]   = useState('')
  // Datos del comprador leídos de su guía ZOOM/TEALCA en Despachos (precargan cédula, teléfono y ciudad).
  const [guia, setGuia] = useState<DatosGuia | null>(null)

  // IVA
  const [withIva, setWithIva] = useState(fuente ? fuente.with_iva : true)
  const [ivaRate, setIvaRate] = useState(fuente?.with_iva ? fuente.iva_rate : 16)

  // Líneas: de la venta, con el descuento de la venta ya aplicado al precio unitario
  const [lines, setLines] = useState<Line[]>(() => {
    if (fuente) {
      return fuente.items.map(it => ({
        product_id: it.product_id, description: it.description, quantity: it.quantity,
        unit_price_usd: it.unit_price_usd ?? round2(it.unit_price_bs / fuente.exchange_rate),
      }))
    }
    return saleLines(sale)
  })

  const [voidReason, setVoidReason] = useState('')
  const [hojaEnBlanco, setHojaEnBlanco] = useState(false)   // corregir con el mismo número: lo confirma el usuario
  // Zoom de la vista "Revisar" (18-10: al 72 % fijo los datos se leían lejos).
  const [zoomVista, setZoomVista] = useState(0.72)
  const zoomCon = (d: number) => setZoomVista(z => Math.min(2, Math.max(0.5, Math.round((z + d) * 100) / 100)))
  // Revisar antes de emitir: el número correlativo se gasta recién en "Emitir e imprimir".
  const [revisando, setRevisando] = useState(false)
  const { imprimir, marco } = useImprimirFactura()
  const saleId = fuente ? fuente.sale_id : sale?.id ?? null
  // Ventas agrupadas en esta hoja. Al corregir (mismo número o nuevo) se conservan las de la factura original.
  const [otras, setOtras] = useState<VentaAgrupable[]>([])
  const otrasFijas = fuente?.otras_ventas ?? []
  const cambiarOtras = (nuevas: VentaAgrupable[]) => { setOtras(nuevas); setLines(juntarLineas(sale, nuevas)) }

  // Borrador autoguardado (solo al facturar una venta; no al reemitir)
  const draftSaleId = !fuente && sale ? sale.id : null
  const [hydrated, setHydrated] = useState(false)
  const [draftInfo, setDraftInfo] = useState<{ updated_at: string; updated_by: string | null } | null>(null)
  const [draftState, setDraftState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const lastSavedRef = useRef<string>('')
  const pendingRef = useRef<string | null>(null)

  const applyDraft = (d: Partial<Draft>) => {
    if (d.control !== undefined)   setControl(d.control)
    if (d.date)                    setDate(d.date)
    if (d.rateTouched && d.rate)   { setRate(d.rate); setRateTouched(true) }
    if (d.name !== undefined)      setName(d.name)
    if (d.doc !== undefined)       setDoc(d.doc)
    if (d.address !== undefined)   setAddress(d.address)
    if (d.phone !== undefined)     setPhone(d.phone)
    if (d.isSpecial !== undefined) setIsSpecial(d.isSpecial)
    if (d.retPct)                  setRetPct(d.retPct)
    if (d.withIva !== undefined)   setWithIva(d.withIva)
    if (d.ivaRate !== undefined)   setIvaRate(d.ivaRate)
    if (Array.isArray(d.lines) && d.lines.length) setLines(d.lines)
    if (Array.isArray(d.otras)) setOtras(d.otras)
  }

  // Config inicial (próximo número, IVA por defecto, tasa BCV de hoy) y, encima, el borrador
  useEffect(() => {
    const draftReq: Promise<DraftResp | null> = draftSaleId
      ? fetch(`/api/invoices/drafts/${draftSaleId}`).then(r => r.ok ? r.json() : null).catch(() => null)
      : Promise.resolve(null)
    Promise.all([
      fetch('/api/invoices/config').then(r => r.json()) as Promise<ConfigResp>,
      draftReq,
    ]).then(([c, draft]) => {
      setConfig(c)
      setNumber(edita ? edita.invoice_number : c.next_number)
      setDate(edita ? edita.invoice_date : c.today)
      if (edita) setControl(edita.control_number ?? '')
      if (fuente) {
        setRate(fuente.exchange_rate)
      } else {
        setRate(c.rate ?? 0)
        setRateDate(c.rate_date)
        setIvaRate(c.iva)
      }
      if (draft?.data) {
        applyDraft(draft.data)
        setDraftInfo({ updated_at: draft.updated_at, updated_by: draft.updated_by })
      }
      setHydrated(true)
      // Sin borrador: cédula, teléfono y ciudad salen de la guía (si la venta ya tiene una subida).
      if (draftSaleId && !draft?.data) {
        fetch(`/api/invoices/datos-guia/${draftSaleId}`).then(r => r.ok ? r.json() : null).then((g: DatosGuia | null) => {
          if (!g) return
          setGuia(g)
          if (g.documento) setDoc(g.documento)
          if (g.telefono) setPhone(g.telefono)
          if (g.ciudad) setAddress(g.ciudad)
        }).catch(() => {})
      }
    }).catch(() => setError('No se pudo cargar la configuración de facturación'))
    fetch('/api/invoices/customers').then(r => r.json()).then(rows => {
      if (Array.isArray(rows)) setCustomers(rows)
    }).catch(() => {})
  }, [fuente, edita, draftSaleId])

  // Al cambiar la fecha, la tasa sigue a la BCV de esa fecha (salvo que se haya editado a mano)
  useEffect(() => {
    if (!config || !date || rateTouched) return
    fetch(`/api/invoices/config?date=${date}`).then(r => r.json()).then((c: ConfigResp) => {
      setRate(c.rate ?? 0)
      setRateDate(c.rate_date)
    }).catch(() => {})
  }, [date, config, rateTouched])

  const applyCustomer = (c: InvoiceCustomer) => {
    setName(c.name); setDoc(c.doc_id); setAddress(c.address ?? ''); setPhone(c.phone ?? '')
    setIsSpecial(c.is_special); setRetPct(c.retention_percent || 75)
  }
  // Si se tipea un RIF que ya está registrado, completa el resto de los datos.
  const onDocBlur = () => {
    const d = normalizeDoc(doc)
    if (!d) return
    const c = customers.find(x => x.doc_id === d)
    if (c && c.name !== name) applyCustomer(c)
  }
  const clearCustomer = () => {
    setName(''); setDoc(''); setAddress(''); setPhone(''); setIsSpecial(false); setRetPct(75)
  }

  const hasDoc = normalizeDoc(doc) !== ''
  const calc = useMemo(() => calcInvoice({
    lines: lines.map(l => ({ quantity: l.quantity, unit_price_bs: round2(l.unit_price_usd * rate) })),
    with_iva: withIva, iva_rate: ivaRate,
    is_special: hasDoc && isSpecial, retention_percent: retPct,
  }), [lines, rate, withIva, ivaRate, hasDoc, isSpecial, retPct])
  const totalUsd = round2(lines.reduce((a, l) => a + l.quantity * l.unit_price_usd, 0))

  const setLine = (k: number, patch: Partial<Line>) =>
    setLines(ls => ls.map((l, i) => i === k ? { ...l, ...patch } : l))

  const problems = [
    ...(!name.trim() ? ['nombre del cliente'] : []),
    ...(!normalizeDoc(doc) ? ['cédula o RIF'] : []),
    ...(!phone.trim() ? ['teléfono'] : []),
    ...(!address.trim() ? ['dirección'] : []),
    ...(lines.length === 0 ? ['al menos una línea'] : []),
    ...(lines.length > MAX_INVOICE_LINES ? [`máximo ${MAX_INVOICE_LINES} líneas (la hoja no admite más)`] : []),
    ...(lines.some(l => !l.description.trim() || !(l.quantity > 0)) ? ['descripción y cantidad en cada línea'] : []),
    ...(lines.some(l => !(l.unit_price_usd > 0)) ? ['monto (precio) en cada línea'] : []),
    ...(!(rate > 0) ? ['tasa BCV'] : []),
    ...(!(number > 0) ? ['número de factura'] : []),
    ...(fuente && !voidReason.trim() ? ['qué salió mal'] : []),
    ...(edita && !hojaEnBlanco ? ['confirmar que la hoja está en blanco'] : []),
  ]

  // ── Autoguardado ──────────────────────────────────────────────────────────
  const draftJson = JSON.stringify({
    control, date, rate, rateTouched, name, doc, address, phone,
    isSpecial, retPct, withIva, ivaRate, lines, otras,
  } satisfies Draft)

  const saveDraft = async (json: string, keepalive = false) => {
    if (!draftSaleId) return
    const res = await fetch(`/api/invoices/drafts/${draftSaleId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: `{"data":${json}}`, keepalive,
    }).catch(() => null)
    if (keepalive) return
    if (res?.ok) {
      lastSavedRef.current = json
      if (pendingRef.current === json) pendingRef.current = null
      const d = await res.json().catch(() => null)
      setDraftInfo({ updated_at: d?.updated_at ?? new Date().toISOString(), updated_by: null })
      setDraftState('saved')
    } else {
      setDraftState('error')
    }
  }

  useEffect(() => {
    if (!draftSaleId || !hydrated || saved) return
    // La primera foto después de cargar es la línea base: no se guarda sin cambios reales.
    if (!lastSavedRef.current) { lastSavedRef.current = draftJson; return }
    if (draftJson === lastSavedRef.current) return
    pendingRef.current = draftJson
    const t = setTimeout(() => { setDraftState('saving'); saveDraft(draftJson) }, 800)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftJson, hydrated, draftSaleId, saved])

  // Al cerrar con cambios todavía dentro del debounce, se mandan igual.
  useEffect(() => () => {
    if (pendingRef.current) saveDraft(pendingRef.current, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const discardDraft = async () => {
    if (!draftSaleId) return
    pendingRef.current = null
    await fetch(`/api/invoices/drafts/${draftSaleId}`, { method: 'DELETE' }).catch(() => {})
    // Vuelve a los datos de la venta
    setControl(''); setDate(config?.today ?? date); setRateTouched(false)
    setName(sale?.customer_name ?? ''); setDoc(''); setAddress(''); setPhone('')
    setIsSpecial(false); setRetPct(75); setWithIva(true); setIvaRate(config?.iva ?? 16)
    setLines(saleLines(sale)); setOtras([])
    lastSavedRef.current = ''
    setDraftInfo(null); setDraftState('idle')
  }

  const submit = async () => {
    if (problems.length) { setError(`Falta: ${problems.join(', ')}`); return }
    setBusy(true); setError(null)
    const res = edita
      ? await fetch(`/api/invoices/${edita.id}/corregir`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            motivo: voidReason.trim(),
            control_number: control || undefined,
            invoice_date: date,
            exchange_rate: rate,
            customer: {
              name: name.trim(), doc: doc.trim(), address: address.trim(),
              phone: phone.trim(), is_special: hasDoc && isSpecial, retention_percent: retPct,
            },
            with_iva: withIva,
            iva_rate: withIva ? ivaRate : 0,
            items: lines.map(l => ({ ...l, description: l.description.trim() })),
          }),
        })
      : await fetch('/api/invoices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sale_id: saleId,
        otras_ventas: replaces ? otrasFijas.map(v => v.id) : otras.map(v => v.id),
        invoice_number: number,
        control_number: control || undefined,
        invoice_date: date,
        exchange_rate: rate,
        customer: {
          name: name.trim(), doc: doc.trim() || undefined, address: address.trim() || undefined,
          phone: phone.trim() || undefined, is_special: hasDoc && isSpecial, retention_percent: retPct,
        },
        with_iva: withIva,
        iva_rate: withIva ? ivaRate : 0,
        items: lines.map(l => ({ ...l, description: l.description.trim() })),
        replaces_id: replaces?.id,
        void_reason: replaces ? voidReason.trim() : undefined,
      }),
    })
    setBusy(false)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { setError(data.error ?? (edita ? 'Error al guardar la corrección' : 'Error al emitir la factura')); return }
    pendingRef.current = null   // el servidor ya borró el borrador al emitir
    setSaved(data)
    onSaved(data)
    imprimir(data.id)           // en esta misma pestaña
  }

  const custOptions = useMemo(
    () => customers.map(c => ({ id: c.id, name: `${c.doc_id} · ${c.name}${c.is_special ? ' · ESPECIAL' : ''}` })),
    [customers],
  )

  return (
    <div className="fixed inset-0 z-[60]">
      {marco}
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-full max-w-2xl bg-white shadow-2xl flex flex-col">
        <div className="px-5 py-4 border-b flex items-center justify-between shrink-0">
          <div>
            <h2 className="font-semibold text-lg">
              {edita ? `Corregir factura #${edita.invoice_number} (mismo número)`
                : replaces ? `Corregir factura #${replaces.invoice_number} (número nuevo)` : 'Facturar venta'}
            </h2>
            {(sale || fuente?.sale_order_number) && (
              <div className="text-xs text-neutral-500 font-mono">
                Venta {sale?.ml_order_number ?? fuente?.sale_order_number}
                {(otras.length || otrasFijas.length) ? ` + ${otras.length || otrasFijas.length} más` : ''}
              </div>
            )}
            {draftSaleId && !saved && (
              <div className="text-[11px] mt-0.5 flex items-center gap-2">
                <span className={draftState === 'error' ? 'text-red-600' : 'text-neutral-400'}>
                  {draftState === 'saving' ? 'Guardando borrador…'
                    : draftState === 'error' ? 'No se pudo guardar el borrador'
                    : draftInfo ? `Borrador guardado ${hhmm(draftInfo.updated_at)}${draftInfo.updated_by ? ` · ${draftInfo.updated_by}` : ''}`
                    : 'Los cambios se guardan solos como borrador'}
                </span>
                {draftInfo && (
                  <button onClick={discardDraft} className="text-neutral-500 hover:text-red-600 underline">Descartar borrador</button>
                )}
              </div>
            )}
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700 text-xl leading-none">✕</button>
        </div>

        {saved ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
            <div className="text-4xl">🧾</div>
            <div>
              <div className="text-lg font-semibold">Factura #{saved.invoice_number} {edita ? 'corregida' : 'emitida'}</div>
              <div className="text-sm text-neutral-500">{saved.customer_name} · Bs {bs(saved.total_bs)}</div>
              {replaces && <div className="text-xs text-red-600 mt-1">La #{replaces.invoice_number} quedó ANULADA.</div>}
              {!edita && saved.invoice_number !== number && (
                <div className="text-sm font-medium text-amber-700 mt-1">
                  Salió con el #{saved.invoice_number}: el #{number} lo usó otra factura emitida al mismo tiempo. Imprímela en la hoja del #{saved.invoice_number}.
                </div>
              )}
            </div>
            <p className="text-xs text-neutral-500 max-w-sm">
              Se abrió la vista previa: revisa la hoja y toca “Imprimir”. Si la cerraste, ábrela otra vez.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <button onClick={() => imprimir(saved.id)} className="btn-secondary text-sm">Ver e imprimir (mismo N°)</button>
              <button onClick={onClose} className="btn-primary text-sm">Listo</button>
            </div>
            <p className="text-[11px] text-neutral-400 max-w-sm">
              ¿Salió con un error? No hagas otra venta: abre esta venta y toca “¿Salió mal?”.
            </p>
          </div>
        ) : (
          <>
            {revisando && (
              <div className="flex-1 overflow-auto px-5 py-4 space-y-3 bg-neutral-100">
                {error && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">{error}</div>}
                <p className="text-sm text-neutral-700">
                  Así va a salir la factura <b>#{number}</b>. Si algo está mal, toca <b>← Corregir</b>: {edita ? 'todavía no se guardó la corrección.' : 'todavía no se usó el número.'}
                </p>
                <div className="sticky top-0 z-10 flex items-center justify-center gap-1.5">
                  <button type="button" onClick={() => zoomCon(-0.15)} className="btn-secondary text-sm px-3" title="Alejar">−</button>
                  <span className="w-14 text-center text-xs tabular-nums text-neutral-600 bg-white/80 rounded">{Math.round(zoomVista * 100)} %</span>
                  <button type="button" onClick={() => zoomCon(0.15)} className="btn-secondary text-sm px-3" title="Acercar">+</button>
                  <button type="button" onClick={() => setZoomVista(0.72)} className="btn-secondary text-xs">Ajustar</button>
                </div>
                <div className="w-fit mx-auto bg-white shadow" style={{ zoom: zoomVista }}>
                  <FacturaVista membrete={config?.membrete} invoice={{
                    invoice_number: number, invoice_date: date, customer_name: name.trim(),
                    customer_doc: normalizeDoc(doc) || null, customer_address: address.trim() || null,
                    customer_phone: phone.trim() || null, iva_rate: calc.iva_rate,
                    base_bs: calc.base, iva_bs: calc.iva, total_bs: calc.total,
                    items: calc.lines.map((l, i) => ({
                      description: lines[i]?.description.trim() ?? '', quantity: l.quantity,
                      unit_price_bs: l.unit_price_bs, total_bs: l.total_bs,
                    })),
                  }} />
                </div>
              </div>
            )}
            <div className={`flex-1 overflow-y-auto px-5 py-4 space-y-5 ${revisando ? 'hidden' : ''}`}>
              {error && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">{error}</div>}

              {edita && (
                <div className="bg-sky-50 border border-sky-200 rounded-lg p-3 space-y-2">
                  <p className="text-sm text-sky-900">
                    Corrige abajo lo que está mal. La factura <b>sigue siendo la #{edita.invoice_number}</b> y se imprime en la
                    misma hoja. Queda registrado qué se cambió, quién y cuándo.
                  </p>
                  <label className="flex items-start gap-2 text-sm text-sky-900 cursor-pointer">
                    <input type="checkbox" checked={hojaEnBlanco} onChange={e => setHojaEnBlanco(e.target.checked)} className="mt-0.5 w-4 h-4" />
                    <span>Confirmo que la hoja <b>N° de control {String(edita.invoice_number).padStart(6, '0')}</b> está <b>en blanco</b> (no se imprimió en ella).
                      Si ya se imprimió, cierra esto y usa “Ya se imprimió y salió mal”.</span>
                  </label>
                  <label className="text-xs text-sky-800">¿Qué corriges? <span className="text-red-500">*</span></label>
                  <input value={voidReason} onChange={e => setVoidReason(e.target.value)}
                    placeholder="Ej: nombre mal escrito, RIF equivocado, faltó un producto" className={inputCls} />
                </div>
              )}

              {replaces && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-2">
                  <p className="text-sm text-red-800">
                    Corrige abajo lo que salió mal. Al emitir, la <b>#{replaces.invoice_number}</b> queda <b>ANULADA</b> (no se
                    borra) y sale una nueva con el siguiente número, en la <b>misma venta</b>.
                  </p>
                  <p className="text-xs text-red-800">
                    La hoja impresa de la #{replaces.invoice_number}: márcala <b>ANULADA</b> y guarda el original y la copia.
                    Si solo se trabó el papel y los datos estaban bien, no hace falta corregir: usa “Imprimir” (mismo número).
                  </p>
                  <label className="text-xs text-red-700">¿Qué salió mal? <span className="text-red-500">*</span></label>
                  <input value={voidReason} onChange={e => setVoidReason(e.target.value)}
                    placeholder="Ej: nombre mal escrito, RIF equivocado, se trabó el papel" className={inputCls} />
                </div>
              )}

              {/* Encabezado */}
              <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="text-xs text-neutral-500">N° factura</label>
                  {edita
                    ? <div className={`${inputCls} bg-neutral-100 tabular-nums`}>{number}</div>
                    : <NumberInput int value={number} onValueChange={setNumber} className={inputCls} />}
                  {config && !edita && number !== config.next_number && (
                    <p className="text-[11px] text-amber-700 mt-1">Sugerido: {config.next_number}</p>
                  )}
                </div>
                <div>
                  <label className="text-xs text-neutral-500">N° control (hoja)</label>
                  <input value={control} onChange={e => setControl(e.target.value)} placeholder="Opcional" className={inputCls} />
                </div>
                <div>
                  <label className="text-xs text-neutral-500">Fecha</label>
                  <DateField value={date} onChange={(v: string) => setDate(v)} className={inputCls} />
                </div>
                <div>
                  <label className="text-xs text-neutral-500">Tasa BCV (Bs/$)</label>
                  <NumberInput value={rate} onValueChange={n => { setRate(n); setRateTouched(true) }} className={inputCls} />
                  <p className="text-[11px] text-neutral-400 mt-1">
                    {rateTouched ? 'Editada a mano' : rateDate ? `BCV del ${rateDate}` : 'Sin tasa cargada'}
                  </p>
                </div>
              </section>

              {/* Cliente */}
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Cliente</h3>
                  <div className="flex gap-2 text-xs">
                    {draftName && name !== draftName && (
                      <button onClick={() => setName(draftName)} className="text-neutral-500 hover:text-neutral-900 underline">
                        Usar nombre de la venta
                      </button>
                    )}
                    <button onClick={clearCustomer} className="text-neutral-500 hover:text-neutral-900 underline">Limpiar</button>
                  </div>
                </div>
                {customers.length > 0 && (
                  <Combobox
                    value={search}
                    options={custOptions}
                    allowCreate={false}
                    placeholder="Buscar cliente ya facturado (RIF o nombre)…"
                    onChange={(text, id) => {
                      if (id != null) {
                        const c = customers.find(x => x.id === id)
                        if (c) applyCustomer(c)
                        setSearch('')
                      } else setSearch(text)
                    }}
                  />
                )}
                {guia && (
                  <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900 space-y-1">
                    <p>
                      📦 Cédula, teléfono y ciudad tomados de la guía {guia.carrier === 'TEALCA' ? 'TEALCA' : 'ZOOM'}: revísalos antes de emitir.
                      {(['documento', 'telefono', 'ciudad'] as const).some(k => !guia[k]) && (
                        <b className="text-amber-700">
                          {' '}Revisar: {[!guia.documento && 'cédula', !guia.telefono && 'teléfono', !guia.ciudad && 'ciudad'].filter(Boolean).join(', ')} (no se pudo leer).
                        </b>
                      )}
                    </p>
                    {guia.direccion && (
                      <p className="text-sky-800">
                        Dirección de la guía: {guia.direccion}
                        {address !== dirCompleta(guia) && (
                          <button type="button" onClick={() => setAddress(dirCompleta(guia))}
                            className="ml-2 underline hover:text-sky-950">Usar dirección completa</button>
                        )}
                      </p>
                    )}
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className="text-xs text-neutral-500">Nombre / Razón social <span className="text-red-500">*</span></label>
                    <input value={name} onChange={e => setName(e.target.value)} className={inputCls} />
                    {sale && name === draftName && draftName && (
                      <p className="text-[11px] text-neutral-400 mt-1">Viene de la venta (Mercado Libre). Cambialo si la factura va a otro nombre.</p>
                    )}
                  </div>
                  <div>
                    <label className="text-xs text-neutral-500">RIF / Cédula <span className="text-red-500">*</span></label>
                    <input value={doc} onChange={e => setDoc(e.target.value)} onBlur={onDocBlur}
                      placeholder="Ej.: V-12345678, J-40282128-0 o 12345678" className={inputCls} />
                  </div>
                  <div>
                    <label className="text-xs text-neutral-500">Teléfono <span className="text-red-500">*</span></label>
                    <input value={phone} onChange={e => setPhone(e.target.value)} className={inputCls} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-xs text-neutral-500">Dirección <span className="text-red-500">*</span></label>
                    <input value={address} onChange={e => setAddress(e.target.value)} className={inputCls} />
                  </div>
                </div>
                <div className={`flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2 ${hasDoc ? '' : 'opacity-50'}`}>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={hasDoc && isSpecial} disabled={!hasDoc}
                      onChange={e => setIsSpecial(e.target.checked)} className="w-4 h-4" />
                    Contribuyente especial (retiene IVA)
                  </label>
                  {hasDoc && isSpecial && (
                    <div className="flex items-center gap-1">
                      {[75, 100].map(p => (
                        <button key={p} onClick={() => setRetPct(p)}
                          className={`px-3 py-1 rounded-full border text-xs ${retPct === p ? 'bg-neutral-900 border-neutral-900 text-white' : 'border-neutral-300 text-neutral-600'}`}>
                          {p}%
                        </button>
                      ))}
                    </div>
                  )}
                  {!hasDoc && <span className="text-[11px] text-neutral-500">Requiere RIF</span>}
                </div>
              </section>

              {/* Varias ventas en una hoja (23-10, mig 114) */}
              {sale && !fuente && <JuntarVentas venta={sale} otras={otras} onCambio={cambiarOtras} />}
              {fuente && otrasFijas.length > 0 && (
                <p className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
                  Esta factura incluye también: {otrasFijas.map(v => v.ml_order_number).join(', ')}. Siguen en la factura corregida.
                </p>
              )}

              {/* Detalle */}
              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Detalle <span className="text-neutral-400 font-normal">({lines.length}/{MAX_INVOICE_LINES} líneas)</span></h3>
                  <button disabled={lines.length >= MAX_INVOICE_LINES}
                    onClick={() => setLines(ls => [...ls, { product_id: null, description: '', quantity: 1, unit_price_usd: 0 }])}
                    className="text-xs text-neutral-600 hover:text-neutral-900 underline disabled:opacity-40 disabled:no-underline">
                    + Agregar línea
                  </button>
                </div>
                {lines.length > MAX_INVOICE_LINES && (
                  <p className="text-xs text-red-600">La hoja admite {MAX_INVOICE_LINES} líneas: quitá o uní algunas.</p>
                )}
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-neutral-50 text-xs text-neutral-500">
                      <tr>
                        <th className="px-2 py-1.5 text-left">Descripción</th>
                        <th className="px-2 py-1.5 text-right w-16">Cant.</th>
                        <th className="px-2 py-1.5 text-right w-24">Unit. $</th>
                        <th className="px-2 py-1.5 text-right w-32">Total Bs</th>
                        <th className="w-6" />
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((l, k) => (
                        <tr key={k} className="border-t">
                          <td className="px-1 py-1">
                            <input value={l.description} onChange={e => setLine(k, { description: e.target.value })}
                              className="w-full border border-neutral-200 rounded px-2 py-1 text-sm" />
                          </td>
                          <td className="px-1 py-1">
                            <NumberInput value={l.quantity} onValueChange={n => setLine(k, { quantity: n })}
                              className="w-full border border-neutral-200 rounded px-2 py-1 text-sm text-right" />
                          </td>
                          <td className="px-1 py-1">
                            <NumberInput value={l.unit_price_usd} onValueChange={n => setLine(k, { unit_price_usd: n })}
                              className="w-full border border-neutral-200 rounded px-2 py-1 text-sm text-right" />
                          </td>
                          <td className="px-2 py-1 text-right whitespace-nowrap tabular-nums">{bs(calc.lines[k]?.total_bs ?? 0)}</td>
                          <td className="pr-1 text-center">
                            <button onClick={() => setLines(ls => ls.filter((_, i) => i !== k))}
                              className="text-neutral-400 hover:text-red-600" title="Quitar línea">×</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-[11px] text-neutral-400">
                  Los precios vienen de la venta (con su descuento aplicado). En la hoja se imprimen en Bs a la tasa indicada.
                </p>
              </section>

              {/* IVA y totales */}
              <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={withIva} onChange={e => setWithIva(e.target.checked)} className="w-4 h-4" />
                    Sumar IVA
                  </label>
                  {withIva && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-neutral-500">Alícuota</span>
                      <NumberInput value={ivaRate} onValueChange={setIvaRate}
                        className="w-20 border border-neutral-300 rounded px-2 py-1 text-sm text-right" />
                      <span className="text-neutral-500">%</span>
                    </div>
                  )}
                  <p className="text-[11px] text-neutral-400">
                    La venta está registrada sin IVA: marcarlo lo suma encima del monto.
                  </p>
                </div>
                <div className="bg-neutral-50 rounded-lg p-3 text-sm space-y-1 tabular-nums">
                  <div className="flex justify-between"><span className="text-neutral-500">Monto base</span><span>Bs {bs(calc.base)}</span></div>
                  <div className="flex justify-between"><span className="text-neutral-500">IVA ({calc.iva_rate}%)</span><span>Bs {bs(calc.iva)}</span></div>
                  <div className="flex justify-between font-semibold border-t pt-1"><span>Total a pagar</span><span>Bs {bs(calc.total)}</span></div>
                  <div className="flex justify-between text-xs text-neutral-400"><span>Equivale a</span><span>$ {bs(round2(calc.total / (rate || 1)))} (venta: $ {bs(totalUsd)})</span></div>
                  {calc.retention > 0 && (
                    <>
                      <div className="flex justify-between text-amber-700 border-t pt-1">
                        <span>Retención IVA {calc.retention_percent}%</span><span>− Bs {bs(calc.retention)}</span>
                      </div>
                      <div className="flex justify-between font-semibold text-amber-800">
                        <span>Neto a cobrar</span><span>Bs {bs(calc.net)}</span>
                      </div>
                      <p className="text-[11px] text-amber-700">La retención no se imprime: la aplica el cliente en su comprobante.</p>
                    </>
                  )}
                </div>
              </section>
            </div>

            <div className="p-4 border-t flex items-center justify-between gap-2 shrink-0 bg-neutral-50">
              <span className="text-xs text-neutral-500">
                {problems.length > 0 ? `Falta: ${problems.join(', ')}`
                  : edita ? `Sigue siendo la factura #${number}`
                  : revisando ? `Revisa la hoja: el #${number} se usa al emitir` : `Será la factura #${number}`}
              </span>
              <div className="flex gap-2">
                {revisando ? (
                  <>
                    <button onClick={() => setRevisando(false)} disabled={busy} className="btn-secondary text-sm">← Corregir</button>
                    <button onClick={submit} disabled={busy || problems.length > 0}
                      className={replaces ? 'btn-danger text-sm' : 'btn-primary text-sm'}>
                      {busy ? (edita ? 'Guardando…' : 'Emitiendo…')
                        : edita ? 'Guardar corrección e imprimir' : replaces ? 'Anular, emitir e imprimir' : 'Emitir e imprimir'}
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={onClose} className="btn-secondary text-sm">Cancelar</button>
                    <button onClick={() => { setError(null); setRevisando(true) }} disabled={problems.length > 0} className="btn-primary text-sm">
                      Revisar →
                    </button>
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/** Buscar y marcar otras ventas para la misma hoja. Sin texto sugiere las del mismo comprador (30 días); con texto
 *  busca por nº de orden, comprador o producto. Las ya facturadas no salen nunca (lo filtra el servidor). */
function JuntarVentas({ venta, otras, onCambio }: { venta: Sale; otras: VentaAgrupable[]; onCambio: (v: VentaAgrupable[]) => void }) {
  const [q, setQ] = useState('')
  const [res, setRes] = useState<VentaAgrupable[] | null>(null)
  const [abierto, setAbierto] = useState(false)
  useEffect(() => {
    if (!abierto) return
    const t = setTimeout(() => {
      fetch(`/api/invoices/agrupables?venta=${venta.id}&q=${encodeURIComponent(q.trim())}`)
        .then(r => r.ok ? r.json() : []).then(d => setRes(Array.isArray(d) ? d : [])).catch(() => setRes([]))
    }, q.trim() ? 300 : 0)
    return () => clearTimeout(t)
  }, [q, abierto, venta.id])
  const marcadas = new Set(otras.map(v => v.id))
  const fechaCorta = (f: string) => new Date(f).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit' })

  return (
    <section className="space-y-2 rounded-lg border border-neutral-200 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">
          Juntar con otras ventas
          {otras.length > 0 && <span className="ml-1 font-normal text-neutral-500">· {otras.length + 1} ventas en esta factura</span>}
        </h3>
        {!abierto && <button onClick={() => setAbierto(true)} className="text-xs text-neutral-600 underline hover:text-neutral-900">Buscar ventas</button>}
      </div>
      {otras.length > 0 && (
        <ul className="space-y-1">
          {otras.map(v => (
            <li key={v.id} className="flex items-start justify-between gap-2 rounded bg-lime-50 px-2 py-1.5 text-xs">
              <span className="min-w-0"><span className="font-mono">{v.ml_order_number}</span> · {v.customer_name}
                <span className="block truncate text-neutral-500">{resumenItems(v)}</span></span>
              <button onClick={() => onCambio(otras.filter(x => x.id !== v.id))} className="shrink-0 text-neutral-500 underline hover:text-red-600">Quitar</button>
            </li>
          ))}
        </ul>
      )}
      {abierto && (
        <>
          <input type="search" value={q} onChange={e => setQ(e.target.value)} autoFocus
            placeholder="Nº de orden, comprador o producto (nombre o código)…" className={inputCls} />
          <p className="text-[11px] text-neutral-500">
            {q.trim() ? 'Últimos 90 días, sin factura.' : `Del mismo comprador (${venta.customer_name}), últimos 30 días, sin factura.`}
            {' '}Al agregar o quitar una venta, el detalle se arma de nuevo con todas.
          </p>
          {res === null ? <p className="text-xs text-neutral-400">Buscando…</p>
            : res.filter(v => !marcadas.has(v.id)).length === 0 ? <p className="text-xs text-neutral-400">No hay ventas sin factura con eso.</p>
            : (
              <ul className="max-h-56 divide-y divide-neutral-100 overflow-y-auto rounded border border-neutral-200">
                {res.filter(v => !marcadas.has(v.id)).map(v => (
                  <li key={v.id} className="flex items-start justify-between gap-2 px-2 py-1.5 text-xs">
                    <span className="min-w-0">
                      <span className="font-mono">{v.ml_order_number}</span> · {fechaCorta(v.created_at)} · {v.customer_name}
                      <span className="block truncate text-neutral-500">{resumenItems(v)} · $ {bs(v.total_amount)}</span>
                    </span>
                    <button onClick={() => onCambio([...otras, v])} className="btn-secondary shrink-0 text-xs">Agregar</button>
                  </li>
                ))}
              </ul>
            )}
        </>
      )}
    </section>
  )
}
