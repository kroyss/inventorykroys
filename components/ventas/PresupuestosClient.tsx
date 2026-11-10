'use client'
import { leerNumero } from '@/lib/numeroTexto'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AjustesPresupuesto } from '@/lib/presupuestos'

// Presupuestos (08-11): lista, armar/editar, ver la hoja (Guardar PDF), datos del negocio y pasar a venta.
export interface ProductoPres { id: number; code: string; name: string; stock: number; precio: number }
type Item = { product_id: number | null; descripcion: string; cantidad: string; precio: string }
interface Fila { id: number; numero: number; cliente: string; total: number; moneda: string; estado: string; validez_dias: number; creado_at: string; venta: string | null; n_items: number; usuario: string | null }
interface Pres {
  id?: number; numero?: number; cliente: string; cliente_doc: string; cliente_contacto: string; items: Item[]
  descuento: string; moneda: 'USD' | 'COP' | 'VES'; validez_dias: string; notas: string; estado?: string; venta?: string | null; creado_at?: string
}

const ESTADO: Record<string, [string, string]> = {
  borrador: ['Borrador', 'bg-neutral-100 text-neutral-600'], enviado: ['Enviado', 'bg-sky-100 text-sky-700'],
  aceptado: ['Aceptado', 'bg-emerald-100 text-emerald-700'], rechazado: ['Rechazado', 'bg-red-100 text-red-700'],
}
const num = (s: string) => leerNumero(s)   // 10-11: «36.45» y «36,45» (lib/numeroTexto.ts)
const fmt = (n: number, m: string) => (m === 'COP' ? '$ ' : m === 'VES' ? 'Bs ' : 'US$ ')
  + n.toLocaleString('de-DE', { minimumFractionDigits: m === 'COP' ? 0 : 2, maximumFractionDigits: m === 'COP' ? 0 : 2 })
const vence = (creado: string | undefined, dias: number) => {
  const d = creado ? new Date(creado) : new Date(); d.setDate(d.getDate() + dias); return d
}

function achicar(file: File): Promise<string> {
  return new Promise((ok, mal) => {
    const img = new Image()
    img.onload = () => {
      const k = Math.min(1, 400 / Math.max(img.width, img.height))
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k)
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height); ok(c.toDataURL('image/png')); URL.revokeObjectURL(img.src)
    }
    img.onerror = () => mal(new Error('No se pudo leer la imagen'))
    img.src = URL.createObjectURL(file)
  })
}

export default function PresupuestosClient({ productos, ajustes: aj0, monedaBase }: { productos: ProductoPres[]; ajustes: AjustesPresupuesto; monedaBase: 'USD' | 'COP' }) {
  const [lista, setLista] = useState<Fila[] | null>(null)
  const [p, setP] = useState<Pres | null>(null)            // editando
  const [ver, setVer] = useState<Pres | null>(null)        // la hoja
  const [aj, setAj] = useState<AjustesPresupuesto>(aj0)
  const [verAjustes, setVerAjustes] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null)
  const [guardando, setGuardando] = useState(false)

  const cargar = useCallback(() => { fetch('/api/presupuestos').then(r => r.json()).then(d => setLista(d.presupuestos ?? [])).catch(() => setLista([])) }, [])
  useEffect(() => { cargar() }, [cargar])

  const nuevo = () => { setMsg(null); setP({ cliente: '', cliente_doc: '', cliente_contacto: '', items: [], descuento: '0', moneda: monedaBase, validez_dias: '7', notas: '' }) }
  const abrir = async (id: number, modo: 'editar' | 'ver') => {
    setMsg(null)
    const r = await fetch(`/api/presupuestos/${id}`); const d = await r.json()
    if (!r.ok) { setMsg({ ok: false, t: d.error ?? 'No se pudo abrir' }); return }
    const x: Pres = {
      id: d.id, numero: d.numero, cliente: d.cliente, cliente_doc: d.cliente_doc ?? '', cliente_contacto: d.cliente_contacto ?? '',
      items: (d.items ?? []).map((i: { product_id: number | null; descripcion: string; cantidad: number; precio: number }) => ({ ...i, cantidad: String(i.cantidad), precio: String(i.precio).replace('.', ',') })),
      descuento: String(d.descuento).replace('.', ','), moneda: d.moneda, validez_dias: String(d.validez_dias), notas: d.notas ?? '',
      estado: d.estado, venta: d.venta, creado_at: d.creado_at,
    }
    if (modo === 'ver') setVer(x); else setP(x)
  }
  const guardar = async () => {
    if (!p) return
    setGuardando(true); setMsg(null)
    try {
      const body = {
        cliente: p.cliente, cliente_doc: p.cliente_doc || null, cliente_contacto: p.cliente_contacto || null,
        items: p.items.map(i => ({ product_id: i.product_id, descripcion: i.descripcion, cantidad: num(i.cantidad), precio: num(i.precio) })),
        descuento: num(p.descuento) || 0, moneda: p.moneda, validez_dias: Number(p.validez_dias) || 7, notas: p.notas || null,
      }
      if (body.items.some(i => !Number.isFinite(i.cantidad) || !Number.isFinite(i.precio))) { setMsg({ ok: false, t: 'Revisa cantidades y precios' }); return }
      const r = await fetch(p.id ? `/api/presupuestos/${p.id}` : '/api/presupuestos', { method: p.id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setMsg({ ok: false, t: d.error ?? 'No se pudo guardar' }); return }
      const id = p.id ?? d.id
      setP(null); cargar(); await abrir(id, 'ver')
    } finally { setGuardando(false) }
  }
  const estado = async (id: number, e: string) => {
    await fetch(`/api/presupuestos/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ estado: e }) })
    cargar(); if (ver?.id === id) setVer({ ...ver, estado: e })
  }
  const aVenta = async (id: number) => {
    if (!confirm('¿El cliente aceptó? Se crea una venta LOCAL en Borrador con estos productos (el inventario se descuenta recién al procesarla, como siempre).')) return
    const r = await fetch(`/api/presupuestos/${id}/venta`, { method: 'POST' }); const d = await r.json().catch(() => ({}))
    if (!r.ok) { setMsg({ ok: false, t: d.error ?? 'No se pudo' }); return }
    setMsg({ ok: true, t: `Listo: venta ${d.venta} creada en Borrador${d.libres ? ` (${d.libres} ítem${d.libres === 1 ? '' : 's'} sin producto quedaron en la nota)` : ''}.` })
    cargar(); if (ver?.id === id) setVer({ ...ver, estado: 'aceptado', venta: d.venta })
  }
  const borrar = async (id: number) => {
    if (!confirm('¿Borrar este presupuesto?')) return
    await fetch(`/api/presupuestos/${id}`, { method: 'DELETE' }); cargar(); setVer(null)
  }

  return (
    <div className="space-y-4">
      <style>{`@media print {
        @page { size: A4; margin: 12mm }
        body * { visibility: hidden !important }
        #presupuesto-hoja, #presupuesto-hoja * { visibility: visible !important }
        #presupuesto-hoja { position: absolute; left: 0; top: 0; width: 100%; border: 0 !important; box-shadow: none !important; padding: 0 !important }
      }`}</style>
      {msg && <div className={`print:hidden text-sm rounded-lg px-3 py-2 border ${msg.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-700'}`}>{msg.t}</div>}

      {!p && !ver && (
        <div className="print:hidden space-y-3">
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => setVerAjustes(true)} className="btn-secondary text-sm">Datos del negocio</button>
            <button type="button" onClick={nuevo} className="btn-primary text-sm">+ Nuevo presupuesto</button>
          </div>
          {!lista ? <div className="h-32 rounded-xl border border-neutral-200 bg-neutral-50 animate-pulse" /> : !lista.length ? (
            <p className="text-sm text-neutral-500 bg-white rounded-xl border border-neutral-200 px-4 py-8 text-center">Todavía no hay presupuestos. Toca «+ Nuevo presupuesto».</p>
          ) : (
            <ul className="bg-white rounded-xl border border-neutral-200 shadow-sm divide-y divide-neutral-100">
              {lista.map(f => {
                const [t, cls] = ESTADO[f.estado] ?? [f.estado, '']
                const vencido = f.estado !== 'aceptado' && vence(f.creado_at, f.validez_dias) < new Date()
                return (
                  <li key={f.id}>
                    <button type="button" onClick={() => abrir(f.id, 'ver')} className="w-full text-left flex flex-wrap items-center gap-3 px-4 py-2.5 hover:bg-neutral-50">
                      <span className="text-sm font-medium w-14 num">N° {f.numero}</span>
                      <span className="min-w-0 flex-1"><span className="block text-sm truncate">{f.cliente}</span>
                        <span className="block text-xs text-neutral-500">{new Date(f.creado_at).toLocaleDateString('es-VE')} · {f.n_items} producto{f.n_items === 1 ? '' : 's'}{f.usuario ? ` · ${f.usuario}` : ''}{f.venta ? ` · venta ${f.venta}` : ''}</span></span>
                      {vencido && <span className="text-[11px] text-amber-700">vencido</span>}
                      <span className={`text-[11px] rounded-full px-2 py-0.5 ${cls}`}>{t}</span>
                      <span className="text-sm font-medium num w-28 text-right">{fmt(f.total, f.moneda)}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}

      {p && <Editor p={p} setP={setP} productos={productos} guardando={guardando} onGuardar={guardar} onCancelar={() => setP(null)} />}

      {ver && (
        <div className="space-y-3">
          <div className="print:hidden flex flex-wrap items-center justify-between gap-2">
            <button type="button" onClick={() => setVer(null)} className="text-sm text-neutral-600 hover:text-neutral-900">← Todos los presupuestos</button>
            <div className="flex flex-wrap gap-2">
              {!ver.venta && <button type="button" onClick={() => { setP(ver); setVer(null) }} className="btn-secondary text-sm">Editar</button>}
              {!ver.venta && ver.estado !== 'enviado' && <button type="button" onClick={() => estado(ver.id!, 'enviado')} className="btn-secondary text-sm">Marcar enviado</button>}
              {!ver.venta && ver.estado !== 'rechazado' && <button type="button" onClick={() => estado(ver.id!, 'rechazado')} className="btn-secondary text-sm">Rechazado</button>}
              {!ver.venta && <button type="button" onClick={() => aVenta(ver.id!)} className="btn-secondary text-sm">Aceptado → pasar a venta</button>}
              {!ver.venta && <button type="button" onClick={() => borrar(ver.id!)} className="text-sm text-red-600 px-2">Borrar</button>}
              <button type="button" onClick={() => window.print()} className="btn-primary text-sm">Guardar PDF</button>
            </div>
          </div>
          <p className="print:hidden text-[11px] text-neutral-500">«Guardar PDF» abre la impresión: elige <b>Guardar como PDF</b> y mándalo por WhatsApp.</p>
          <Hoja p={ver} aj={aj} />
        </div>
      )}

      {verAjustes && <AjustesModal aj={aj} onCerrar={() => setVerAjustes(false)} onGuardado={a => { setAj(a); setVerAjustes(false); setMsg({ ok: true, t: 'Datos del negocio guardados.' }) }} />}
    </div>
  )
}

function Editor({ p, setP, productos, guardando, onGuardar, onCancelar }: {
  p: Pres; setP: (p: Pres) => void; productos: ProductoPres[]; guardando: boolean; onGuardar: () => void; onCancelar: () => void
}) {
  const [q, setQ] = useState('')
  const sugerencias = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return []
    return productos.filter(x => x.name.toLowerCase().includes(t) || x.code.toLowerCase().includes(t)).slice(0, 8)
  }, [q, productos])
  const set = (x: Partial<Pres>) => setP({ ...p, ...x })
  const item = (i: number, x: Partial<Item>) => set({ items: p.items.map((y, j) => j === i ? { ...y, ...x } : y) })
  const bruto = p.items.reduce((a, i) => a + (num(i.cantidad) || 0) * (num(i.precio) || 0), 0)
  const total = bruto * (1 - (num(p.descuento) || 0) / 100)
  const input = 'w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm'
  return (
    <section className="print:hidden bg-white rounded-xl border border-neutral-200 shadow-sm p-4 space-y-4">
      <h2 className="font-semibold text-neutral-900">{p.numero ? `Presupuesto N° ${p.numero}` : 'Nuevo presupuesto'}</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-sm"><span className="text-xs font-medium text-neutral-600">Cliente *</span>
          <input value={p.cliente} maxLength={120} onChange={e => set({ cliente: e.target.value })} className={`mt-1 ${input}`} /></label>
        <label className="block text-sm"><span className="text-xs font-medium text-neutral-600">Cédula / RIF (opcional)</span>
          <input value={p.cliente_doc} maxLength={40} onChange={e => set({ cliente_doc: e.target.value })} className={`mt-1 ${input}`} /></label>
        <label className="block text-sm"><span className="text-xs font-medium text-neutral-600">Teléfono o correo (opcional)</span>
          <input value={p.cliente_contacto} maxLength={120} onChange={e => set({ cliente_contacto: e.target.value })} className={`mt-1 ${input}`} /></label>
      </div>

      <div className="space-y-2">
        <div className="relative">
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Agregar producto: busca por nombre o código" className={input} />
          {sugerencias.length > 0 && (
            <ul className="absolute z-10 mt-1 w-full bg-white border border-neutral-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
              {sugerencias.map(x => (
                <li key={x.id}><button type="button" onClick={() => { set({ items: [...p.items, { product_id: x.id, descripcion: x.name, cantidad: '1', precio: String(x.precio).replace('.', ',') }] }); setQ('') }}
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-neutral-50 flex justify-between gap-2"><span className="truncate">{x.name}</span><span className="text-xs text-neutral-500 num">{x.stock} u. · {x.precio.toLocaleString('de-DE')}</span></button></li>
              ))}
            </ul>
          )}
        </div>
        <button type="button" onClick={() => set({ items: [...p.items, { product_id: null, descripcion: '', cantidad: '1', precio: '' }] })} className="text-xs text-sky-700 hover:underline">+ Agregar un ítem libre (servicio, envío, algo que no está en el inventario)</button>
        {p.items.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-neutral-500"><tr><th className="text-left py-1">Producto</th><th className="w-20 text-right">Cant.</th><th className="w-28 text-right">Precio</th><th className="w-28 text-right">Total</th><th className="w-8" /></tr></thead>
              <tbody className="divide-y divide-neutral-100">
                {p.items.map((i, k) => (
                  <tr key={k}>
                    <td className="py-1 pr-2"><input value={i.descripcion} maxLength={200} onChange={e => item(k, { descripcion: e.target.value })} className="w-full rounded border border-neutral-200 px-2 py-1 text-sm" />
                      {!i.product_id && <span className="text-[10px] text-neutral-400">ítem libre</span>}</td>
                    <td className="pl-1"><input inputMode="decimal" value={i.cantidad} onChange={e => item(k, { cantidad: e.target.value })} className="w-full rounded border border-neutral-200 px-2 py-1 text-sm text-right num" /></td>
                    <td className="pl-1"><input inputMode="decimal" value={i.precio} onChange={e => item(k, { precio: e.target.value })} className="w-full rounded border border-neutral-200 px-2 py-1 text-sm text-right num" /></td>
                    <td className="text-right num">{fmt((num(i.cantidad) || 0) * (num(i.precio) || 0), p.moneda)}</td>
                    <td className="text-right"><button type="button" onClick={() => set({ items: p.items.filter((_, j) => j !== k) })} className="text-red-600 px-1" aria-label="Quitar">✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <label className="block text-sm"><span className="text-xs font-medium text-neutral-600">Moneda</span>
          <select value={p.moneda} onChange={e => set({ moneda: e.target.value as Pres['moneda'] })} className={`mt-1 ${input} bg-white`}>
            <option value="USD">Dólares (US$)</option><option value="VES">Bolívares (Bs)</option><option value="COP">Pesos ($)</option>
          </select></label>
        <label className="block text-sm"><span className="text-xs font-medium text-neutral-600">Descuento %</span>
          <input inputMode="decimal" value={p.descuento} onChange={e => set({ descuento: e.target.value })} className={`mt-1 ${input} num`} /></label>
        <label className="block text-sm"><span className="text-xs font-medium text-neutral-600">Válido por (días)</span>
          <input inputMode="numeric" value={p.validez_dias} onChange={e => set({ validez_dias: e.target.value.replace(/\D/g, '') })} className={`mt-1 ${input} num`} /></label>
        <div className="text-right self-end"><span className="block text-xs text-neutral-500">Total</span><span className="text-lg font-semibold num">{fmt(total, p.moneda)}</span></div>
      </div>
      <p className="text-[11px] text-neutral-500">Los precios se cargan del producto ({p.moneda === 'COP' ? 'precio de venta' : 'precio final en dólares'}); si cambias la moneda, ajusta los precios.</p>
      <label className="block text-sm"><span className="text-xs font-medium text-neutral-600">Nota para el cliente (opcional)</span>
        <textarea rows={2} maxLength={1000} value={p.notas} onChange={e => set({ notas: e.target.value })} className={`mt-1 ${input}`} /></label>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancelar} disabled={guardando} className="btn-secondary text-sm">Cancelar</button>
        <button type="button" onClick={onGuardar} disabled={guardando || !p.cliente.trim() || !p.items.length} className="btn-primary text-sm">{guardando ? 'Guardando…' : 'Guardar y ver'}</button>
      </div>
    </section>
  )
}

function Hoja({ p, aj }: { p: Pres; aj: AjustesPresupuesto }) {
  const bruto = p.items.reduce((a, i) => a + (num(i.cantidad) || 0) * (num(i.precio) || 0), 0)
  const desc = num(p.descuento) || 0
  const fecha = p.creado_at ? new Date(p.creado_at) : new Date()
  return (
    <div id="presupuesto-hoja" className="bg-white rounded-xl border border-neutral-200 shadow-sm p-8 mx-auto max-w-[210mm] text-neutral-900 text-sm">
      <header className="flex items-start justify-between gap-4 border-b border-neutral-300 pb-4">
        <div className="flex items-center gap-4">
          {aj.logo && <img src={aj.logo} alt="" className="h-16 w-auto object-contain" />}
          <div><p className="text-xl font-bold">{aj.nombre || 'Mi negocio'}</p>
            {aj.datos && <p className="text-xs text-neutral-600 whitespace-pre-wrap">{aj.datos}</p>}</div>
        </div>
        <div className="text-right"><p className="text-lg font-semibold tracking-wide">PRESUPUESTO</p>
          <p className="num">N° {p.numero}</p>
          <p className="text-xs text-neutral-600">Fecha: {fecha.toLocaleDateString('es-VE')}</p>
          <p className="text-xs text-neutral-600">Válido hasta: {vence(p.creado_at, Number(p.validez_dias) || 7).toLocaleDateString('es-VE')}</p></div>
      </header>
      <section className="py-4"><p className="text-xs text-neutral-500">Cliente</p>
        <p className="font-medium">{p.cliente}</p>
        {(p.cliente_doc || p.cliente_contacto) && <p className="text-xs text-neutral-600">{[p.cliente_doc, p.cliente_contacto].filter(Boolean).join(' · ')}</p>}</section>
      <table className="w-full">
        <thead><tr className="border-y border-neutral-300 text-xs text-neutral-600"><th className="text-left py-1.5">Descripción</th><th className="text-right w-16">Cant.</th><th className="text-right w-28">Precio</th><th className="text-right w-28">Total</th></tr></thead>
        <tbody>{p.items.map((i, k) => (
          <tr key={k} className="border-b border-neutral-100"><td className="py-1.5">{i.descripcion}</td><td className="text-right num">{i.cantidad}</td>
            <td className="text-right num">{fmt(num(i.precio) || 0, p.moneda)}</td><td className="text-right num">{fmt((num(i.cantidad) || 0) * (num(i.precio) || 0), p.moneda)}</td></tr>
        ))}</tbody>
      </table>
      <div className="mt-3 ml-auto w-64 space-y-1">
        {desc > 0 && <>
          <div className="flex justify-between"><span>Subtotal</span><span className="num">{fmt(bruto, p.moneda)}</span></div>
          <div className="flex justify-between"><span>Descuento {desc.toLocaleString('es-VE')}%</span><span className="num">− {fmt(bruto * desc / 100, p.moneda)}</span></div>
        </>}
        <div className="flex justify-between border-t border-neutral-300 pt-1 text-base font-bold"><span>Total</span><span className="num">{fmt(bruto * (1 - desc / 100), p.moneda)}</span></div>
      </div>
      {p.notas && <p className="mt-6 text-sm whitespace-pre-wrap">{p.notas}</p>}
      {aj.condiciones && <footer className="mt-6 border-t border-neutral-300 pt-3 text-xs text-neutral-600 whitespace-pre-wrap">{aj.condiciones}</footer>}
    </div>
  )
}

function AjustesModal({ aj, onCerrar, onGuardado }: { aj: AjustesPresupuesto; onCerrar: () => void; onGuardado: (a: AjustesPresupuesto) => void }) {
  const [a, setA] = useState(aj)
  const [err, setErr] = useState<string | null>(null)
  const logo = useRef<HTMLInputElement>(null)
  const guardar = async () => {
    const r = await fetch('/api/presupuestos/ajustes', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(a) })
    if (r.ok) onGuardado(a); else setErr((await r.json().catch(() => ({}))).error ?? 'No se pudo guardar')
  }
  const input = 'mt-1 w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm'
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4 print:hidden" onClick={onCerrar}>
      <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl p-5 space-y-3 max-h-[88vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h3 className="font-semibold text-neutral-900">Datos del negocio (salen en cada presupuesto)</h3>
        <div className="flex items-center gap-3">
          <div className="w-16 h-16 rounded-lg border border-neutral-200 bg-neutral-50 grid place-items-center overflow-hidden">{a.logo ? <img src={a.logo} alt="" className="max-w-full max-h-full object-contain" /> : <span className="text-[10px] text-neutral-400">Logo</span>}</div>
          <button type="button" onClick={() => logo.current?.click()} className="text-xs px-2 py-1 rounded border border-neutral-300">{a.logo ? 'Cambiar logo' : 'Subir logo'}</button>
          {a.logo && <button type="button" onClick={() => setA({ ...a, logo: null })} className="text-xs text-red-600">Quitar</button>}
          <input ref={logo} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={async e => { const f = e.target.files?.[0]; if (f) { try { setA({ ...a, logo: await achicar(f) }) } catch { setErr('No se pudo leer el logo') } } }} />
        </div>
        <label className="block text-sm"><span className="text-xs font-medium text-neutral-600">Nombre del negocio</span>
          <input value={a.nombre} maxLength={80} onChange={e => setA({ ...a, nombre: e.target.value })} className={input} /></label>
        <label className="block text-sm"><span className="text-xs font-medium text-neutral-600">RIF, dirección, teléfono</span>
          <textarea rows={3} value={a.datos} maxLength={400} onChange={e => setA({ ...a, datos: e.target.value })} className={input} /></label>
        <label className="block text-sm"><span className="text-xs font-medium text-neutral-600">Condiciones (formas de pago, envíos, garantía)</span>
          <textarea rows={4} value={a.condiciones} maxLength={1000} onChange={e => setA({ ...a, condiciones: e.target.value })} className={input} /></label>
        {err && <p className="text-xs text-red-700">{err}</p>}
        <div className="flex justify-end gap-2"><button type="button" onClick={onCerrar} className="btn-secondary text-sm">Cancelar</button><button type="button" onClick={guardar} className="btn-primary text-sm">Guardar</button></div>
      </div>
    </div>
  )
}
