'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Sale } from '@/lib/types'
import {
  bs, calcInvoice, normalizeDoc, round2, MAX_INVOICE_LINES,
  type Invoice, type InvoiceCustomer,
} from '@/lib/invoices'
import { Combobox } from '@/components/ui/Combobox'
import NumberInput from '@/components/ui/NumberInput'

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
}

interface DraftResp { data: Partial<Draft>; updated_at: string; updated_by: string | null }

const saleLines = (sale?: Sale): Line[] => {
  const disc = sale?.discount_percent ?? 0
  return (sale?.items ?? []).map(i => ({
    product_id: i.product_id, description: i.product_name, quantity: i.quantity,
    unit_price_usd: round2(i.unit_price * (1 - disc / 100)),
  }))
}

const hhmm = (iso: string) => new Date(iso).toLocaleString('es-VE', {
  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
})

interface ConfigResp {
  next_number: number
  iva: number
  today: string
  rate: number | null
  rate_date: string | null
}

const inputCls = 'mt-1 w-full border border-neutral-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-800'

export default function FacturaForm({ sale, replaces, onClose, onSaved }: Props) {
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
  const [rateTouched, setRateTouched] = useState(!!replaces)

  // Cliente: borrador desde la venta (nombre de ML) o desde la factura que se reemplaza
  const draftName = replaces?.customer_name ?? sale?.customer_name ?? ''
  const [name, setName]       = useState(draftName)
  const [doc, setDoc]         = useState(replaces?.customer_doc ?? '')
  const [address, setAddress] = useState(replaces?.customer_address ?? '')
  const [phone, setPhone]     = useState(replaces?.customer_phone ?? '')
  const [isSpecial, setIsSpecial] = useState(replaces?.is_special ?? false)
  const [retPct, setRetPct]   = useState(replaces?.retention_percent || 75)
  const [search, setSearch]   = useState('')

  // IVA
  const [withIva, setWithIva] = useState(replaces ? replaces.with_iva : true)
  const [ivaRate, setIvaRate] = useState(replaces?.with_iva ? replaces.iva_rate : 16)

  // Líneas: de la venta, con el descuento de la venta ya aplicado al precio unitario
  const [lines, setLines] = useState<Line[]>(() => {
    if (replaces) {
      return replaces.items.map(it => ({
        product_id: it.product_id, description: it.description, quantity: it.quantity,
        unit_price_usd: it.unit_price_usd ?? round2(it.unit_price_bs / replaces.exchange_rate),
      }))
    }
    return saleLines(sale)
  })

  const [voidReason, setVoidReason] = useState('')
  const saleId = replaces ? replaces.sale_id : sale?.id ?? null

  // Borrador autoguardado (solo al facturar una venta; no al reemitir)
  const draftSaleId = !replaces && sale ? sale.id : null
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
      setNumber(c.next_number)
      setDate(c.today)
      if (replaces) {
        setRate(replaces.exchange_rate)
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
    }).catch(() => setError('No se pudo cargar la configuración de facturación'))
    fetch('/api/invoices/customers').then(r => r.json()).then(rows => {
      if (Array.isArray(rows)) setCustomers(rows)
    }).catch(() => {})
  }, [replaces, draftSaleId])

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
    ...(lines.length === 0 ? ['al menos una línea'] : []),
    ...(lines.length > MAX_INVOICE_LINES ? [`máximo ${MAX_INVOICE_LINES} líneas (la hoja no admite más)`] : []),
    ...(lines.some(l => !l.description.trim() || !(l.quantity > 0)) ? ['descripción y cantidad en cada línea'] : []),
    ...(!(rate > 0) ? ['tasa BCV'] : []),
    ...(!(number > 0) ? ['número de factura'] : []),
    ...(replaces && !voidReason.trim() ? ['motivo de la anulación'] : []),
  ]

  // ── Autoguardado ──────────────────────────────────────────────────────────
  const draftJson = JSON.stringify({
    control, date, rate, rateTouched, name, doc, address, phone,
    isSpecial, retPct, withIva, ivaRate, lines,
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
    setLines(saleLines(sale))
    lastSavedRef.current = ''
    setDraftInfo(null); setDraftState('idle')
  }

  const submit = async () => {
    if (problems.length) { setError(`Falta: ${problems.join(', ')}`); return }
    setBusy(true); setError(null)
    const res = await fetch('/api/invoices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sale_id: saleId,
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
    if (!res.ok) { setError(data.error ?? 'Error al emitir la factura'); return }
    pendingRef.current = null   // el servidor ya borró el borrador al emitir
    setSaved(data)
    onSaved(data)
  }

  const custOptions = useMemo(
    () => customers.map(c => ({ id: c.id, name: `${c.doc_id} · ${c.name}${c.is_special ? ' · ESPECIAL' : ''}` })),
    [customers],
  )

  return (
    <div className="fixed inset-0 z-[60]">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-full max-w-2xl bg-white shadow-2xl flex flex-col">
        <div className="px-5 py-4 border-b flex items-center justify-between shrink-0">
          <div>
            <h2 className="font-semibold text-lg">
              {replaces ? `Reimprimir en hoja nueva (anula #${replaces.invoice_number})` : 'Facturar venta'}
            </h2>
            {(sale || replaces?.sale_order_number) && (
              <div className="text-xs text-neutral-500 font-mono">
                Venta {sale?.ml_order_number ?? replaces?.sale_order_number}
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
              <div className="text-lg font-semibold">Factura #{saved.invoice_number} emitida</div>
              <div className="text-sm text-neutral-500">{saved.customer_name} · Bs {bs(saved.total_bs)}</div>
              {replaces && <div className="text-xs text-red-600 mt-1">La #{replaces.invoice_number} quedó ANULADA.</div>}
            </div>
            <a href={`/factura/${saved.id}?print=1`} target="_blank" rel="noreferrer" className="btn-primary">
              Imprimir factura #{saved.invoice_number}
            </a>
            <button onClick={onClose} className="btn-secondary text-sm">Cerrar</button>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
              {error && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">{error}</div>}

              {replaces && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-2">
                  <p className="text-sm text-red-800">
                    La factura <b>#{replaces.invoice_number}</b> quedará <b>ANULADA</b> (no se borra) y se emite
                    una nueva con el siguiente número. Usá esto solo si la hoja preimpresa se dañó; si la hoja no se
                    usó, reimprimí la misma factura.
                  </p>
                  <label className="text-xs text-red-700">Motivo de la anulación <span className="text-red-500">*</span></label>
                  <input value={voidReason} onChange={e => setVoidReason(e.target.value)}
                    placeholder="Ej: se trabó el papel, salió corrida" className={inputCls} />
                </div>
              )}

              {/* Encabezado */}
              <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="text-xs text-neutral-500">N° factura</label>
                  <NumberInput int value={number} onValueChange={setNumber} className={inputCls} />
                  {config && number !== config.next_number && (
                    <p className="text-[11px] text-amber-700 mt-1">Sugerido: {config.next_number}</p>
                  )}
                </div>
                <div>
                  <label className="text-xs text-neutral-500">N° control (hoja)</label>
                  <input value={control} onChange={e => setControl(e.target.value)} placeholder="Opcional" className={inputCls} />
                </div>
                <div>
                  <label className="text-xs text-neutral-500">Fecha</label>
                  <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls} />
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className="text-xs text-neutral-500">Nombre / Razón social <span className="text-red-500">*</span></label>
                    <input value={name} onChange={e => setName(e.target.value)} className={inputCls} />
                    {sale && name === draftName && draftName && (
                      <p className="text-[11px] text-neutral-400 mt-1">Viene de la venta (Mercado Libre). Cambialo si la factura va a otro nombre.</p>
                    )}
                  </div>
                  <div>
                    <label className="text-xs text-neutral-500">RIF / Cédula</label>
                    <input value={doc} onChange={e => setDoc(e.target.value)} onBlur={onDocBlur}
                      placeholder="Vacío = consumidor final" className={inputCls} />
                  </div>
                  <div>
                    <label className="text-xs text-neutral-500">Teléfono</label>
                    <input value={phone} onChange={e => setPhone(e.target.value)} className={inputCls} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-xs text-neutral-500">Dirección</label>
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
                {problems.length > 0 ? `Falta: ${problems.join(', ')}` : `Se emitirá la factura #${number}`}
              </span>
              <div className="flex gap-2">
                <button onClick={onClose} className="btn-secondary text-sm">Cancelar</button>
                <button onClick={submit} disabled={busy || problems.length > 0}
                  className={replaces ? 'btn-danger text-sm' : 'btn-primary text-sm'}>
                  {busy ? 'Emitiendo…' : replaces ? 'Anular y emitir nueva' : 'Emitir factura'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
