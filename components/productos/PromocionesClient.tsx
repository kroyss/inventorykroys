'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { PageHeader, EmptyState, FilterPills, Pagination } from '@/components/ui'
import {
  envioPorTransportista, topeDescuento, unidadesParaGratis, parseShippingTable, TABLA_TEALCA, TABLA_ZOOM, type EstadoEnvio,
} from '@/lib/mlShipping'
import { mlNetFor, type VeRate } from '@/lib/pricingVE'
import type { CampanaML, PromoDeItem } from '@/lib/promocionesML'

// Promociones de MercadoLibre (migraciones 094 y 097).
//  Fase 1: ver campañas, envío gratis por transportista, descuento máximo y unidades para el envío gratis.
//  Fase 2: agregar publicaciones a una campaña (de ML o propia) o sacarlas, crear y borrar campañas propias;
//          siempre con vista previa (precio, envío, unidades, margen) y registro de quién hizo qué.
//  Fase 3: margen neto al precio de la promoción y sugerencias por campaña.

export interface CampanaVista extends CampanaML { conexionId: number; cuentas: string[]; adentro: number; candidatas: number }
export interface FilaPromo {
  id: string; conexionId: number; cuenta: string; titulo: string; precio: number; producto: string | null; costo: number | null
  peso: number | null; pesoFuente: 'portal' | 'producto' | null
  promos: (PromoDeItem & { nombre: string })[]
  programadas: { nombre: string; precio: number; inicio: string | null }[]
}
export interface AccionHecha {
  id: number; conexion_id: number; accion: string; campana_nombre: string | null; item_id: string | null
  precio: number | null; precio_antes: number | null; resultado: 'ok' | 'error'; detalle: string | null; creado_at: string; usuario: string | null
}

type Filtro = 'todas' | 'adentro' | 'candidatas' | 'quita' | 'margen' | 'tealca' | 'destino' | 'sin_peso'
type Modal =
  | { tipo: 'agregar'; claves: string[]; campana: string; pct: number }
  | { tipo: 'nueva' }
  | { tipo: 'editar'; campana: CampanaVista }
  | null
const POR_PAGINA = 50
const RANGO: Record<EstadoEnvio, number> = { ambas: 2, tealca: 1, destino: 0, sin_peso: -1 }

const usd = (n: number | null | undefined) => n == null ? '—' : `$${n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const pct = (n: number) => `${n.toLocaleString('de-DE', { maximumFractionDigits: 1 })}%`
const fecha = (s: string | null) => s ? new Date(s).toLocaleDateString('es-VE', { timeZone: 'America/Caracas', day: '2-digit', month: '2-digit' }) : '—'
const cuando = (s: string | null) => s ? new Date(s).toLocaleString('es-VE', { timeZone: 'America/Caracas', day: '2-digit', month: '2-digit', hour: 'numeric', minute: '2-digit' }) : 'nunca'
const urlML = (id: string) => `https://articulo.mercadolibre.com.ve/${id.replace(/^MLV/, 'MLV-')}`
const redondear = (n: number) => Math.round(n * 100) / 100
const hoyMas = (dias: number) => { const d = new Date(); d.setDate(d.getDate() + dias); return d.toLocaleDateString('en-CA', { timeZone: 'America/Caracas' }) }
const clave = (f: { conexionId: number; id: string }) => `${f.conexionId}|${f.id}`

const ENVIO: Record<EstadoEnvio, { t: string; c: string }> = {
  ambas:    { t: 'ZOOM y TEALCA', c: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  tealca:   { t: 'Solo TEALCA',   c: 'bg-amber-50 text-amber-800 border-amber-200' },
  destino:  { t: 'Cobro a destino', c: 'bg-red-50 text-red-700 border-red-200' },
  sin_peso: { t: 'Sin peso',      c: 'bg-neutral-50 text-neutral-500 border-neutral-200' },
}
const Chip = ({ e }: { e: EstadoEnvio }) => <span className={`inline-block px-2 py-0.5 rounded-full border text-[11px] ${ENVIO[e].c}`}>{ENVIO[e].t}</span>

export default function PromocionesClient({ filas, campanas, cuentas, pesosAl, conPagosME, historial }: {
  filas: FilaPromo[]; campanas: CampanaVista[]
  cuentas: { id: number; nombre: string; actualizado_at: string; error: string | null }[]
  pesosAl: string | null; conPagosME: boolean; historial: AccionHecha[]
}) {
  const router = useRouter()
  const [filtro, setFiltro] = useState<Filtro>('todas')
  const [cuenta, setCuenta] = useState('')
  const [campana, setCampana] = useState('')        // conexión|id de la campaña elegida (filtro)
  const [buscar, setBuscar] = useState('')
  const [pagina, setPagina] = useState(1)
  const [busy, setBusy] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [modal, setModal] = useState<Modal>(null)
  const [margenMin, setMargenMin] = useState(15)
  const [pctSug, setPctSug] = useState(10)
  // Margen neto (Fase 3): tasas y parámetros de ML de Ajustes, como el catálogo.
  const [veRate, setVeRate] = useState<VeRate | null>(null)
  const [ml, setMl] = useState<Record<string, string>>({})
  useEffect(() => {
    let vivo = true
    Promise.all([
      fetch('/api/rates/latest').then(r => r.json()).catch(() => null),
      fetch('/api/settings').then(r => r.json()).catch(() => ({})),
    ]).then(([r, s]) => {
      if (!vivo) return
      if (r?.official_rate) setVeRate({ official: r.official_rate, parallel: r.parallel_rate, excess: r.excess_percentage })
      setMl(s ?? {})
      try { const v = Number(localStorage.getItem('promo_margen_min')); if (v > 0 && v <= 90) setMargenMin(v) } catch { /* sin storage */ }
    })
    return () => { vivo = false }
  }, [])
  const shipTable = useMemo(() => parseShippingTable(ml.ml_shipping_table), [ml.ml_shipping_table])

  const margenA = useMemo(() => (f: FilaPromo, precio: number) => {
    if (f.costo == null || !veRate) return null
    const r = mlNetFor('VE', { total_cost: f.costo, profit_percentage: 0, discount_percent: 0, sale_price: precio, weight_kg: f.peso },
      veRate, 0, ml, 0, shipTable, precio)
    return r ? r.margen : null
  }, [veRate, ml, shipTable])

  const vistas = useMemo(() => filas.map(f => {
    const adentro = f.promos.filter(p => p.estado === 'started' && p.precio != null)
    const enPromo = adentro.length ? adentro.reduce((a, b) => (b.precio! < a.precio! ? b : a)) : null
    const actual = enPromo?.precio ?? f.precio
    const envio = envioPorTransportista(f.peso, actual)
    const sinPromo = envioPorTransportista(f.peso, f.precio)
    return {
      ...f, enPromo, actual, envio,
      quitaEnvio: !!enPromo && RANGO[sinPromo.estado] > RANGO[envio.estado],
      uTealca: envio.estado === 'destino' ? unidadesParaGratis(f.peso, actual, TABLA_TEALCA) : null,
      uZoom: envio.estado === 'destino' || envio.estado === 'tealca' ? unidadesParaGratis(f.peso, actual, TABLA_ZOOM) : null,
      descuento: enPromo && f.precio > 0 ? (1 - actual / f.precio) * 100 : 0,
      candidatas: f.promos.filter(p => p.estado === 'candidate'),
      topeAmbas: topeDescuento(f.precio, envio.minZoom),
      topeTealca: topeDescuento(f.precio, envio.minTealca),
      margen: margenA(f, actual),
    }
  }), [filas, margenA])
  type Vista = typeof vistas[number]
  const porClave = useMemo(() => new Map(vistas.map(v => [clave(v), v])), [vistas])

  // Sugerencias (Fase 3): candidatas que, con el % propuesto, respetan el mínimo de ML, no pierden envío
  // gratis y quedan con margen ≥ el mínimo.
  const sugeridas = (c: CampanaVista) => vistas.filter(v => {
    if (v.conexionId !== c.conexionId) return false
    const cand = v.promos.find(p => p.campana === c.id && p.estado === 'candidate')
    if (!cand) return false
    const precio = redondear(v.precio * (1 - pctSug / 100))
    if (cand.minimo != null && precio < cand.minimo) return false
    if (RANGO[envioPorTransportista(v.peso, precio).estado] < RANGO[v.envio.estado]) return false
    const m = margenA(v, precio)
    return m != null && m >= margenMin
  })

  const [campCon, campId] = campana ? campana.split('|') : ['', '']
  const base = vistas.filter(v => (!cuenta || v.cuenta === cuenta)
    && (!campana || (String(v.conexionId) === campCon && v.promos.some(p => p.campana === campId))))
  const cuenta_ = (fn: (v: Vista) => boolean) => base.filter(fn).length
  const filtros: Record<Filtro, (v: Vista) => boolean> = {
    todas: () => true,
    adentro: v => !!v.enPromo,
    candidatas: v => v.candidatas.length > 0,
    quita: v => v.quitaEnvio,
    margen: v => v.margen != null && v.margen < margenMin,
    tealca: v => v.envio.estado === 'tealca',
    destino: v => v.envio.estado === 'destino',
    sin_peso: v => v.envio.estado === 'sin_peso',
  }
  const q = buscar.trim().toLowerCase()
  const lista = base.filter(filtros[filtro]).filter(v => !q || v.titulo.toLowerCase().includes(q) || v.id.toLowerCase().includes(q) || (v.producto ?? '').toLowerCase().includes(q))
  const visibles = lista.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA)
  const toggle = (k: string) => setSel(s => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n })
  const todasVisibles = visibles.length > 0 && visibles.every(v => sel.has(clave(v)))

  const llamar = async (url: string, init: RequestInit, ok: (d: Record<string, unknown>) => string) => {
    setError(null); setAviso(null)
    const r = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...init })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setError(d.error ?? 'No se pudo hacer'); return null }
    setAviso(ok(d)); router.refresh()
    return d
  }

  const actualizarML = async () => {
    setBusy('ml'); setError(null); setAviso('Leyendo campañas y precios de MercadoLibre… puede tardar un minuto.')
    const r = await fetch('/api/promociones/actualizar', { method: 'POST' })
    const d = await r.json().catch(() => ({}))
    setBusy(null)
    if (!r.ok) { setAviso(null); setError(d.error ?? 'No se pudo actualizar'); return }
    const res = (d.resultado ?? []) as { cuenta: string; ok: boolean; publicaciones?: number; campanas?: number; error?: string }[]
    setAviso(res.map(x => x.ok ? `${x.cuenta}: ${x.publicaciones} publicaciones, ${x.campanas} campañas` : `${x.cuenta}: error (${x.error})`).join(' · ') || 'Sin cuentas activas')
    router.refresh()
  }
  const actualizarPesos = async () => {
    setBusy('pesos')
    await llamar('/api/promociones/pesos', { method: 'POST' },
      () => 'Pedido enviado a la PC de Pagos ME: trae los pesos del portal en 1–2 minutos (la PC tiene que estar prendida). Recarga la página después.')
    setBusy(null)
  }
  const sacar = async (v: Vista, p: PromoDeItem & { nombre: string }) => {
    const camp = campanas.find(c => c.conexionId === v.conexionId && c.id === p.campana)
    if (!confirm(`¿Sacar "${v.titulo}" de "${p.nombre}"? Vuelve a su precio publicado (${usd(v.precio)}).`)) return
    setBusy(`sacar-${clave(v)}`)
    await llamar('/api/promociones/acciones', {
      method: 'POST', body: JSON.stringify({ accion: 'quitar', conexionId: v.conexionId, campana: { id: p.campana, tipo: camp?.tipo ?? 'DEAL', nombre: p.nombre }, items: [{ id: v.id }] }),
    }, d => d.error ? `No se pudo sacar: ${((d.resultados as { error?: string }[])?.[0]?.error) ?? ''}` : 'Listo: salió de la promoción.')
    setBusy(null)
  }
  const borrarCampana = async (c: CampanaVista) => {
    if (!confirm(`¿Borrar la campaña "${c.nombre}"? Las publicaciones que tiene vuelven a su precio.`)) return
    setBusy(`borrar-${c.id}`)
    await llamar(`/api/promociones/campanas?conexion=${c.conexionId}&id=${encodeURIComponent(c.id)}&nombre=${encodeURIComponent(c.nombre)}`,
      { method: 'DELETE' }, () => `Campaña "${c.nombre}" borrada.`)
    setBusy(null)
  }
  const guardarMargen = (v: number) => { setMargenMin(v); try { localStorage.setItem('promo_margen_min', String(v)) } catch { /* sin storage */ } }

  const sinFoto = cuentas.length === 0
  const selVistas = [...sel].map(k => porClave.get(k)).filter(Boolean) as Vista[]

  return (
    <div className="space-y-4">
      <PageHeader title="Promociones" subtitle="Campañas de MercadoLibre, envío gratis por transportista y margen al precio de la promo"
        actions={<>
          <Link href="/productos" className="btn-secondary text-sm whitespace-nowrap">← Productos</Link>
          {conPagosME && (
            <button onClick={actualizarPesos} disabled={!!busy} className="btn-secondary text-sm whitespace-nowrap"
              title="Lee los pesos del portal de MercadoEnvíos con el programa de la PC (Pagos ME)">
              {busy === 'pesos' ? 'Pidiendo…' : 'Actualizar pesos'}
            </button>
          )}
          <button onClick={() => setModal({ tipo: 'nueva' })} disabled={!!busy || sinFoto} className="btn-secondary text-sm whitespace-nowrap">+ Campaña propia</button>
          <button onClick={actualizarML} disabled={!!busy} className="btn-primary text-sm whitespace-nowrap">
            {busy === 'ml' ? 'Actualizando…' : 'Actualizar desde MercadoLibre'}
          </button>
        </>} />

      <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3 text-xs text-neutral-600 flex flex-wrap items-center gap-x-5 gap-y-1">
        {cuentas.map(c => (
          <span key={c.id}>
            <b className="text-neutral-800">{c.nombre}</b> · MercadoLibre {cuando(c.actualizado_at)}
            {c.error && <span className="text-red-700"> · error: {c.error}</span>}
          </span>
        ))}
        <span>Pesos del portal: {cuando(pesosAl)}{conPagosME ? ' (se traen solos 1 vez al día)' : ''}</span>
        <label className="ml-auto flex items-center gap-1.5" title="Para las sugerencias y el filtro de margen bajo">
          Margen mínimo
          <input type="number" min={0} max={90} value={margenMin} onChange={e => guardarMargen(Math.max(0, Math.min(90, Number(e.target.value) || 0)))}
            className="w-14 border border-neutral-300 rounded px-1.5 py-0.5 text-right" />%
        </label>
      </div>

      {error && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>}
      {aviso && <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-800">{aviso}</div>}

      {sinFoto ? (
        <EmptyState message='Todavía no se leyó nada de MercadoLibre. Toca "Actualizar desde MercadoLibre".' />
      ) : <>
        {campanas.length > 0 && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
              <span>Sugerencias con</span>
              <input type="number" min={1} max={80} value={pctSug} onChange={e => setPctSug(Math.max(1, Math.min(80, Number(e.target.value) || 10)))}
                className="w-14 border border-neutral-300 rounded px-1.5 py-0.5 text-right" />
              <span>% de descuento: sin perder envío gratis y con margen ≥ {margenMin}%.</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {campanas.map(c => {
                const k = `${c.conexionId}|${c.id}`
                const propia = c.tipo === 'SELLER_CAMPAIGN'
                const sug = propia ? [] : sugeridas(c)
                return (
                  <div key={k} className={`rounded-xl border px-4 py-3 bg-white ${campana === k ? 'border-emerald-500 ring-1 ring-emerald-500' : 'border-neutral-200'}`}>
                    <button onClick={() => { setCampana(campana === k ? '' : k); setPagina(1) }} className="w-full text-left">
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-medium text-neutral-900">{c.nombre}</div>
                        <span className="text-[11px] text-neutral-400 whitespace-nowrap">{propia ? 'propia' : c.tipo}{c.estado !== 'started' ? ` · ${c.estado}` : ''}</span>
                      </div>
                      <div className="text-xs text-neutral-500 mt-0.5">{fecha(c.inicio)} → {fecha(c.fin)}{!propia && <> · entrar hasta {fecha(c.limite)}</>} · {c.cuentas.join(', ')}</div>
                      <div className="text-sm mt-2"><b>{c.adentro}</b> adentro{!propia && <> · <b>{c.candidatas}</b> pueden entrar</>}</div>
                    </button>
                    <div className="flex flex-wrap items-center gap-3 mt-2 text-xs">
                      {sug.length > 0 && (
                        <button onClick={() => setModal({ tipo: 'agregar', claves: sug.map(clave), campana: k, pct: pctSug })}
                          className="btn-secondary text-xs px-2.5 py-1">Ver {sug.length} sugerida{sug.length === 1 ? '' : 's'}</button>
                      )}
                      {propia && (
                        <button onClick={() => setModal({ tipo: 'editar', campana: c })} disabled={!!busy} className="underline text-neutral-500 hover:text-neutral-800">
                          Editar
                        </button>
                      )}
                      {propia && (
                        <button onClick={() => borrarCampana(c)} disabled={!!busy} className="underline text-neutral-400 hover:text-red-700">
                          {busy === `borrar-${c.id}` ? 'Borrando…' : 'Borrar campaña'}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <FilterPills<Filtro> value={filtro} onChange={v => { setFiltro(v); setPagina(1) }} options={[
            { value: 'todas', label: 'Todas', count: base.length },
            { value: 'adentro', label: 'En promoción', count: cuenta_(filtros.adentro) },
            { value: 'candidatas', label: 'Pueden entrar', count: cuenta_(filtros.candidatas) },
            { value: 'quita', label: 'La promo quita el envío', count: cuenta_(filtros.quita) },
            { value: 'margen', label: `Margen < ${margenMin}%`, count: cuenta_(filtros.margen) },
            { value: 'tealca', label: 'Pierden ZOOM', count: cuenta_(filtros.tealca) },
            { value: 'destino', label: 'Cobro a destino', count: cuenta_(filtros.destino) },
            { value: 'sin_peso', label: 'Sin peso', count: cuenta_(filtros.sin_peso) },
          ]} />
          {cuentas.length > 1 && (
            <select value={cuenta} onChange={e => { setCuenta(e.target.value); setPagina(1) }} className="border border-neutral-300 rounded-lg px-2 py-1 text-sm">
              <option value="">Todas las cuentas</option>
              {cuentas.map(c => <option key={c.id} value={c.nombre}>{c.nombre}</option>)}
            </select>
          )}
          <input value={buscar} onChange={e => { setBuscar(e.target.value); setPagina(1) }} placeholder="Buscar título, MLV o código"
            className="border border-neutral-300 rounded-lg px-3 py-1 text-sm ml-auto w-full sm:w-64" />
        </div>

        {sel.size > 0 && (
          <div className="sticky top-16 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm">
            <b>{sel.size} seleccionada{sel.size === 1 ? '' : 's'}</b>
            <button onClick={() => setModal({ tipo: 'agregar', claves: [...sel], campana: '', pct: pctSug })} className="btn-primary text-sm">Agregar a una campaña…</button>
            <button onClick={() => setSel(new Set())} className="text-xs underline text-neutral-500">Quitar selección</button>
          </div>
        )}

        {lista.length === 0 ? <EmptyState message="Nada con este filtro." /> : (
          <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-xs text-neutral-500">
                <tr>
                  <th className="px-3 py-2 w-8">
                    <input type="checkbox" checked={todasVisibles} onChange={() => setSel(s => {
                      const n = new Set(s)
                      for (const v of visibles) { if (todasVisibles) n.delete(clave(v)); else n.add(clave(v)) }
                      return n
                    })} />
                  </th>
                  <th className="px-3 py-2 text-left">Publicación</th>
                  <th className="px-3 py-2 text-right">Peso</th>
                  <th className="px-3 py-2 text-right">Publicado</th>
                  <th className="px-3 py-2 text-left">En promoción</th>
                  <th className="px-3 py-2 text-left">Puede entrar</th>
                  <th className="px-3 py-2 text-left">Envío gratis hoy</th>
                  <th className="px-3 py-2 text-right">Margen</th>
                  <th className="px-3 py-2 text-left">Descuento máximo</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map(v => {
                  const k = clave(v)
                  return (
                    <tr key={k} className={`border-t border-neutral-100 align-top ${sel.has(k) ? 'bg-emerald-50/60' : ''}`}>
                      <td className="px-3 py-2 text-center"><input type="checkbox" checked={sel.has(k)} onChange={() => toggle(k)} /></td>
                      <td className="px-3 py-2 max-w-[300px]">
                        <a href={urlML(v.id)} target="_blank" rel="noreferrer" className="text-neutral-900 hover:underline line-clamp-2">{v.titulo}</a>
                        <div className="text-[11px] text-neutral-400">{v.id} · {v.cuenta}{v.producto ? ` · ${v.producto}` : ''}</div>
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        {v.peso != null ? <>{v.peso.toLocaleString('de-DE')} kg<div className="text-[11px] text-neutral-400">{v.pesoFuente === 'portal' ? 'portal' : 'producto'}</div></> : <span className="text-neutral-400">—</span>}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">{usd(v.precio)}</td>
                      <td className="px-3 py-2 text-xs">
                        {v.enPromo ? <>
                          <div className="font-medium text-neutral-900">{usd(v.actual)} <span className="text-emerald-700">−{pct(v.descuento)}</span></div>
                          <div className="text-neutral-500">{v.enPromo.nombre}</div>
                          {v.promos.filter(p => p.estado === 'started' && p.campana !== v.enPromo!.campana).map(p => (
                            <div key={p.campana} className="text-neutral-400" title="Guardada: se aplica cuando termine la más baja">
                              también: {p.nombre} {usd(p.precio)} (en espera)
                            </div>
                          ))}
                          {v.quitaEnvio && <div className="mt-0.5 text-red-700 font-medium">⚠ La promo le quita el envío gratis</div>}
                          <button onClick={() => sacar(v, v.enPromo!)} disabled={!!busy} className="mt-0.5 underline text-neutral-400 hover:text-red-700">
                            {busy === `sacar-${k}` ? 'Sacando…' : 'Sacar'}
                          </button>
                        </> : (!v.programadas.length && <span className="text-neutral-400">—</span>)}
                        {v.programadas.map(p => (
                          <div key={p.nombre} className="mt-1 text-sky-800">⏱ {p.nombre}: {usd(p.precio)} desde {fecha(p.inicio)}</div>
                        ))}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {v.candidatas.length ? v.candidatas.map(p => (
                          <div key={p.campana}>{p.nombre}{p.minimo != null && <span className="text-neutral-400"> · desde {usd(p.minimo)}</span>}</div>
                        )) : <span className="text-neutral-400">—</span>}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        <Chip e={v.envio.estado} />
                        {v.envio.minZoom != null && <div className="text-[11px] text-neutral-400 mt-0.5">mín. ZOOM {usd(v.envio.minZoom)} · TEALCA {usd(v.envio.minTealca)}</div>}
                        {v.uTealca && <div className="text-[11px] text-emerald-700 mt-0.5">Gratis desde <b>{v.uTealca.unidades} u.</b> ({usd(v.uTealca.total)})</div>}
                        {v.uZoom && (!v.uTealca || v.uZoom.unidades !== v.uTealca.unidades) && (
                          <div className="text-[11px] text-emerald-700">ZOOM desde <b>{v.uZoom.unidades} u.</b> ({usd(v.uZoom.total)})</div>
                        )}
                      </td>
                      <td className={`px-3 py-2 text-xs text-right whitespace-nowrap ${v.margen == null ? 'text-neutral-400' : v.margen < 0 ? 'text-red-700 font-medium' : v.margen < margenMin ? 'text-amber-700' : 'text-neutral-800'}`}
                        title={v.costo == null ? 'Sin costo: la publicación no está vinculada a un producto con costo' : 'Margen neto sobre venta al precio actual'}>
                        {v.margen == null ? '—' : pct(v.margen)}
                      </td>
                      <td className="px-3 py-2 text-xs whitespace-nowrap">
                        {v.envio.estado === 'sin_peso' ? <span className="text-neutral-400">falta el peso</span> : <>
                          <div>{v.topeAmbas != null ? <>ambas hasta <b>{pct(v.topeAmbas)}</b></> : <span className="text-neutral-400">ZOOM no llega</span>}</div>
                          <div>{v.topeTealca != null ? <>TEALCA hasta <b>{pct(v.topeTealca)}</b></> : <span className="text-neutral-400">TEALCA no llega</span>}</div>
                        </>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <Pagination total={lista.length} page={pagina} pageSize={POR_PAGINA} onChange={setPagina} />
          </div>
        )}

        <Historial historial={historial} />
        <p className="text-xs text-neutral-400">
          Margen: neto sobre venta al precio de la promoción, con el costo del producto, la comisión, el envío y la fuga cambiaria (como en Productos).
          «Desde N u.»: el cliente que compra esa cantidad llega al envío gratis (contando que el paquete pesa más).
        </p>
      </>}

      {modal?.tipo === 'agregar' && (
        <AgregarModal modal={modal} setModal={setModal} filas={modal.claves.map(k => porClave.get(k)).filter(Boolean) as Vista[]}
          campanas={campanas} margenA={margenA} margenMin={margenMin}
          onHecho={(msg, err) => { setModal(null); if (err) setError(err); else { setAviso(msg); setSel(new Set()) } router.refresh() }} />
      )}
      {modal?.tipo === 'nueva' && (
        <NuevaCampanaModal cuentas={cuentas} conexionInicial={selVistas[0]?.conexionId ?? cuentas[0]?.id}
          onCerrar={() => setModal(null)}
          onCreada={nombre => { setModal(null); setAviso(`Campaña "${nombre}" creada. Selecciona publicaciones y usa "Agregar a una campaña…".`); router.refresh() }} />
      )}
      {modal?.tipo === 'editar' && (
        <EditarCampanaModal campana={modal.campana} onCerrar={() => setModal(null)}
          onHecho={msg => { setModal(null); setError(null); setAviso(msg); router.refresh() }} />
      )}
    </div>
  )
}

type VistaModal = FilaPromo & { envio: ReturnType<typeof envioPorTransportista> }

/** Vista previa antes de agregar a una campaña: precio nuevo, envío antes → después, unidades y margen. */
function AgregarModal({ modal, setModal, filas, campanas, margenA, margenMin, onHecho }: {
  modal: Extract<Modal, { tipo: 'agregar' }>; setModal: (m: Modal) => void; filas: VistaModal[]
  campanas: CampanaVista[]; margenA: (f: FilaPromo, precio: number) => number | null; margenMin: number
  onHecho: (msg: string, err?: string) => void
}) {
  const [enviando, setEnviando] = useState(false)
  // Lo que respondió ML por publicación. Si dijo "no es una rebaja real", se puede reintentar A MANO con otro %.
  const [resultados, setResultados] = useState<Record<string, { ok: boolean; precio?: number; manda?: number | null; error?: string; noCreible?: boolean }>>({})
  const [reintento, setReintento] = useState<Record<string, number>>({})
  const conexiones = [...new Set(filas.map(f => f.conexionId))]
  const mezcla = conexiones.length > 1
  const conexionId = conexiones[0]
  // Solo las campañas donde alguna de las elegidas puede entrar: no está ya adentro y, si es de ML, ML se la ofrece.
  const puedenEntrar = (c: CampanaVista) => filas.filter(f => {
    const p = f.promos.find(x => x.campana === c.id)
    return p?.estado !== 'started' && (c.tipo === 'SELLER_CAMPAIGN' || p?.estado === 'candidate')
  }).length
  const opciones = campanas.filter(c => c.conexionId === conexionId && c.estado !== 'finished')
    .map(c => ({ c, n: puedenEntrar(c) }))
    .filter(o => o.n > 0 || `${o.c.conexionId}|${o.c.id}` === modal.campana)
  const camp = campanas.find(c => `${c.conexionId}|${c.id}` === modal.campana) ?? null
  const propia = camp?.tipo === 'SELLER_CAMPAIGN'
  // ML no guarda publicaciones en una campaña que todavía no empezó (responde "ok" pero no queda).
  const sinEmpezar = !!camp && camp.estado !== 'started'

  const filasPrev = filas.map(f => {
    const precio = redondear(f.precio * (1 - modal.pct / 100))
    const cand = camp ? f.promos.find(p => p.campana === camp.id) : undefined
    const yaAdentro = cand?.estado === 'started'
    const puede = !!camp && !yaAdentro && (propia || cand?.estado === 'candidate')
    const bajoMin = cand?.minimo != null && precio < cand.minimo
    const despues = envioPorTransportista(f.peso, precio)
    const pierde = RANGO[despues.estado] < RANGO[f.envio.estado]
    const unidades = despues.estado === 'destino' ? unidadesParaGratis(f.peso, precio, TABLA_TEALCA) : null
    const margen = margenA(f, precio)
    const motivo = !camp ? null : yaAdentro ? 'ya está en esta campaña' : !puede ? 'ML no la ofrece para esta publicación' : bajoMin ? `ML acepta desde ${usd(cand!.minimo)}` : null
    // Ya está en OTRA promoción: entrar a esta la reemplaza (ML deja una sola a la vez).
    const otra = f.promos.find(p => p.estado === 'started' && p.campana !== camp?.id)
    return { f, precio, despues, pierde, unidades, margen, motivo, otra }
  })
  const validas = camp && !sinEmpezar ? filasPrev.filter(x => !x.motivo && !resultados[x.f.id]?.ok) : []

  const enviar = async (items: { id: string; precio: number; precioAntes: number }[]) => {
    if (!camp || !items.length) return
    setEnviando(true)
    const r = await fetch('/api/promociones/acciones', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'agregar', conexionId, campana: { id: camp.id, tipo: camp.tipo, nombre: camp.nombre, estado: camp.estado }, items }),
    })
    const d = await r.json().catch(() => ({}))
    setEnviando(false)
    if (!r.ok) return onHecho('', d.error ?? 'No se pudo agregar')
    const res = d.resultados as { id: string; ok: boolean; precio?: number; manda?: number | null; error?: string; noCreible?: boolean }[]
    const nuevos = { ...resultados }
    for (const x of res) nuevos[x.id] = x
    setResultados(nuevos)
    // Todo bien: se cierra. Con errores queda abierto para ver el motivo y reintentar a mano.
    if (res.every(x => x.ok) && !res.some(x => x.manda)) onHecho(`${d.ok} agregada${d.ok === 1 ? '' : 's'} a "${camp.nombre}" y comprobada${d.ok === 1 ? '' : 's'} en MercadoLibre.`)
  }
  const confirmar = async () => {
    const pierden = validas.filter(x => x.pierde).length
    const bajos = validas.filter(x => x.margen != null && x.margen < margenMin).length
    const reemplazan = validas.filter(x => x.otra).length
    const avisos = [pierden && `${pierden} pierden envío gratis.`, bajos && `${bajos} quedan con margen menor a ${margenMin}%.`,
      reemplazan && `${reemplazan} salen de otra promoción en la que ya están.`].filter(Boolean).join(' ')
    if (avisos && !confirm(`${avisos} ¿Agregar igual?`)) return
    await enviar(validas.map(x => ({ id: x.f.id, precio: x.precio, precioAntes: x.f.precio })))
  }
  const reintentar = async (f: VistaModal) => {
    const p = reintento[f.id] ?? Math.min(80, modal.pct + 5)
    await enviar([{ id: f.id, precio: redondear(f.precio * (1 - p / 100)), precioAntes: f.precio }])
  }
  const hayResultados = Object.keys(resultados).length > 0

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => hayResultados ? onHecho('Listo.') : setModal(null)}>
      <div className="bg-white rounded-xl w-full max-w-4xl max-h-[90vh] overflow-auto p-4 space-y-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Agregar a una campaña · vista previa</h2>
          <button onClick={() => setModal(null)} className="text-neutral-500 text-sm">Cerrar ✕</button>
        </div>
        {mezcla ? (
          <p className="text-sm text-red-700">Elegiste publicaciones de más de una cuenta. Las campañas son de cada cuenta: filtra por una cuenta y vuelve a seleccionar.</p>
        ) : <>
          <div className="flex flex-wrap items-end gap-3 text-sm">
            <label className="space-y-1"><span className="block text-xs text-neutral-500">Campaña</span>
              <select value={modal.campana} onChange={e => setModal({ ...modal, campana: e.target.value })} className="border border-neutral-300 rounded-lg px-2 py-1.5 min-w-[240px]">
                <option value="">Elegir…</option>
                {opciones.map(({ c, n }) => <option key={c.id} value={`${c.conexionId}|${c.id}`}>{c.nombre} {c.tipo === 'SELLER_CAMPAIGN' ? '(propia)' : '(de ML)'} · {n} de {filas.length}</option>)}
              </select>
            </label>
            {!opciones.length && (
              <span className="text-xs text-amber-800 pb-2">Ya están en todas las campañas disponibles, o MercadoLibre no les ofrece ninguna.</span>
            )}
            <label className="space-y-1"><span className="block text-xs text-neutral-500">Descuento</span>
              <span className="flex items-center gap-1">
                <input type="number" min={1} max={80} value={modal.pct} onChange={e => setModal({ ...modal, pct: Math.max(1, Math.min(80, Number(e.target.value) || 1)) })}
                  className="w-16 border border-neutral-300 rounded-lg px-2 py-1.5 text-right" />%
              </span>
            </label>
            <span className="text-xs text-neutral-500 pb-2">{camp ? `${validas.length} de ${filas.length} se pueden agregar` : 'Elige la campaña'}</span>
          </div>
          {sinEmpezar && (
            <p className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900">
              Esta campaña empieza el {fecha(camp!.inicio)}. MercadoLibre no guarda publicaciones antes del inicio
              (dice que sí, pero no quedan): agrégalas ese día.
            </p>
          )}
          <div className="overflow-x-auto border border-neutral-200 rounded-lg">
            <table className="w-full text-xs">
              <thead className="bg-neutral-50 text-neutral-500">
                <tr>
                  <th className="px-2 py-1.5 text-left">Publicación</th><th className="px-2 py-1.5 text-right">Publicado</th>
                  <th className="px-2 py-1.5 text-right">Nuevo</th><th className="px-2 py-1.5 text-left">Envío gratis</th>
                  <th className="px-2 py-1.5 text-right">Margen</th><th className="px-2 py-1.5 text-left">Nota</th>
                </tr>
              </thead>
              <tbody>
                {filasPrev.map(x => (
                  <tr key={x.f.id} className={`border-t border-neutral-100 ${x.motivo ? 'opacity-50' : ''}`}>
                    <td className="px-2 py-1.5 max-w-[260px] truncate" title={x.f.titulo}>{x.f.titulo}</td>
                    <td className="px-2 py-1.5 text-right">{usd(x.f.precio)}</td>
                    <td className="px-2 py-1.5 text-right font-medium">{usd(x.precio)}</td>
                    <td className="px-2 py-1.5">
                      {x.pierde ? <span className="text-red-700">{ENVIO[x.f.envio.estado].t} → <b>{ENVIO[x.despues.estado].t}</b></span> : <Chip e={x.despues.estado} />}
                      {x.unidades && <span className="text-emerald-700"> · gratis desde {x.unidades.unidades} u.</span>}
                    </td>
                    <td className={`px-2 py-1.5 text-right ${x.margen == null ? 'text-neutral-400' : x.margen < 0 ? 'text-red-700 font-medium' : x.margen < margenMin ? 'text-amber-700' : ''}`}>
                      {x.margen == null ? '—' : pct(x.margen)}
                    </td>
                    <td className="px-2 py-1.5 text-neutral-500">
                      {resultados[x.f.id]?.ok ? <span className="text-emerald-700">✓ En la campaña a {usd(resultados[x.f.id].precio)}
                          {resultados[x.f.id].manda != null && <span className="block text-amber-700">Hoy manda otra promoción más baja ({usd(resultados[x.f.id].manda)}): esta se aplica cuando aquella termine.</span>}</span>
                        : resultados[x.f.id] ? <span className="text-red-700">{resultados[x.f.id].error}
                          {resultados[x.f.id].noCreible && (
                            <span className="mt-1 flex items-center gap-1 text-neutral-700">
                              Reintentar con
                              <input type="number" min={1} max={80} value={reintento[x.f.id] ?? Math.min(80, modal.pct + 5)}
                                onChange={e => setReintento({ ...reintento, [x.f.id]: Math.max(1, Math.min(80, Number(e.target.value) || 1)) })}
                                className="w-12 border border-neutral-300 rounded px-1 py-0.5 text-right" />%
                              <span className="text-neutral-500">({usd(redondear(x.f.precio * (1 - (reintento[x.f.id] ?? Math.min(80, modal.pct + 5)) / 100)))})</span>
                              <button onClick={() => reintentar(x.f)} disabled={enviando} className="btn-secondary text-[11px] px-2 py-0.5">Reintentar</button>
                            </span>
                          )}</span>
                        : x.motivo ?? (x.otra ? `sale de «${x.otra.nombre}» (${usd(x.otra.precio)})` : '')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-end gap-2">
            <button onClick={() => setModal(null)} className="btn-ghost text-sm">Cancelar</button>
            {hayResultados && <button onClick={() => onHecho('Listo.')} className="btn-secondary text-sm">Terminar</button>}
            <button onClick={confirmar} disabled={!camp || sinEmpezar || !validas.length || enviando} className="btn-primary text-sm">
              {enviando ? 'Agregando y comprobando…' : `Agregar ${validas.length} a la campaña`}
            </button>
          </div>
        </>}
      </div>
    </div>
  )
}

const MAX_DIAS_CAMPANA = 31   // lib/promocionesML.ts (ML no deja más)
const sumarDias = (f: string, n: number) => { const d = new Date(`${f}T12:00:00`); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }

function NuevaCampanaModal({ cuentas, conexionInicial, onCerrar, onCreada }: {
  cuentas: { id: number; nombre: string }[]; conexionInicial?: number; onCerrar: () => void; onCreada: (nombre: string) => void
}) {
  const [f, setF] = useState({ conexionIds: [conexionInicial ?? cuentas[0]?.id].filter(Boolean) as number[], nombre: '', desde: hoyMas(0), hasta: hoyMas(7) })
  const maxHasta = sumarDias(f.desde, MAX_DIAS_CAMPANA - 1)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const crear = async () => {
    setEnviando(true); setError(null)
    const r = await fetch('/api/promociones/campanas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) })
    const d = await r.json().catch(() => ({}))
    setEnviando(false)
    if (!r.ok) { setError(d.error ?? 'No se pudo crear'); return }
    const malos = (d.resultados as { cuenta: string; ok: boolean; error?: string }[]).filter(x => !x.ok)
    if (malos.length) { setError(`Se creó en algunas cuentas; falló en: ${malos.map(x => `${x.cuenta} (${x.error})`).join(' · ')}`); return }
    onCreada(f.nombre)
  }
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onCerrar}>
      <div className="bg-white rounded-xl w-full max-w-md p-4 space-y-3 text-sm" onClick={e => e.stopPropagation()}>
        <h2 className="text-base font-semibold">Nueva campaña propia</h2>
        <p className="text-xs text-neutral-500">Se crea en MercadoLibre con % flexible: después le agregas publicaciones, cada una con su precio.
          Las publicaciones se pueden agregar <b>cuando la campaña ya empezó</b> (antes ML no las guarda): si empieza hoy, las agregas enseguida.</p>
        <div className="space-y-1"><span className="text-xs text-neutral-500">Cuentas (se crea la misma en cada una)</span>
          <div className="flex flex-wrap gap-3">
            {cuentas.map(c => (
              <label key={c.id} className="flex items-center gap-1.5">
                <input type="checkbox" checked={f.conexionIds.includes(c.id)}
                  onChange={e => setF({ ...f, conexionIds: e.target.checked ? [...f.conexionIds, c.id] : f.conexionIds.filter(x => x !== c.id) })} />
                {c.nombre}
              </label>
            ))}
          </div>
        </div>
        <label className="block space-y-1"><span className="text-xs text-neutral-500">Nombre (lo ves tú)</span>
          <input value={f.nombre} maxLength={60} onChange={e => setF({ ...f, nombre: e.target.value })} placeholder="Quincena noviembre"
            className="w-full border border-neutral-300 rounded-lg px-2 py-1.5" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1"><span className="text-xs text-neutral-500">Desde</span>
            <input type="date" value={f.desde} onChange={e => {
              const desde = e.target.value
              const tope = sumarDias(desde, MAX_DIAS_CAMPANA - 1)
              setF({ ...f, desde, hasta: f.hasta < desde ? desde : f.hasta > tope ? tope : f.hasta })
            }} className="w-full border border-neutral-300 rounded-lg px-2 py-1.5" />
          </label>
          <label className="space-y-1"><span className="text-xs text-neutral-500">Hasta</span>
            <input type="date" value={f.hasta} min={f.desde} max={maxHasta} onChange={e => setF({ ...f, hasta: e.target.value })} className="w-full border border-neutral-300 rounded-lg px-2 py-1.5" />
          </label>
        </div>
        <p className="text-xs text-neutral-400">MercadoLibre deja que dure como máximo {MAX_DIAS_CAMPANA} días (hasta el {maxHasta.split('-').reverse().slice(0, 2).join('/')}).</p>
        {error && <p className="text-red-700 text-xs">{error}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onCerrar} className="btn-ghost text-sm">Cancelar</button>
          <button onClick={crear} disabled={enviando || f.nombre.trim().length < 3 || !f.conexionIds.length || f.hasta > maxHasta} className="btn-primary text-sm">
            {enviando ? 'Creando…' : f.conexionIds.length > 1 ? `Crear en ${f.conexionIds.length} cuentas` : 'Crear en MercadoLibre'}
          </button>
        </div>
      </div>
    </div>
  )
}

/** Fecha YYYY-MM-DD en hora de Venezuela de un instante de ML. */
const diaVE = (s: string | null) => s ? new Date(s).toLocaleDateString('en-CA', { timeZone: 'America/Caracas' }) : hoyMas(0)

/** Campaña propia: cambiar nombre y fechas. Ya empezada, ML solo deja cambiar nombre y fin. */
function EditarCampanaModal({ campana, onCerrar, onHecho }: { campana: CampanaVista; onCerrar: () => void; onHecho: (msg: string) => void }) {
  const empezada = campana.estado === 'started'
  const [f, setF] = useState({ nombre: campana.nombre, desde: diaVE(campana.inicio), hasta: diaVE(campana.fin) })
  const minDesde = hoyMas(0)
  const maxHasta = sumarDias(f.desde, MAX_DIAS_CAMPANA - 1)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const guardar = async () => {
    setEnviando(true); setError(null)
    const r = await fetch('/api/promociones/campanas', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conexionId: campana.conexionId, id: campana.id, nombre: f.nombre, desde: empezada ? null : f.desde, hasta: f.hasta }),
    })
    const d = await r.json().catch(() => ({}))
    setEnviando(false)
    if (!r.ok) { setError(d.error ?? 'No se pudo guardar'); return }
    onHecho(d.estado === 'started' && !empezada
      ? `Campaña "${f.nombre}" guardada: ya empezó, puedes agregarle publicaciones.`
      : `Campaña "${f.nombre}" guardada en MercadoLibre.`)
  }
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onCerrar}>
      <div className="bg-white rounded-xl w-full max-w-md p-4 space-y-3 text-sm" onClick={e => e.stopPropagation()}>
        <h2 className="text-base font-semibold">Editar campaña · {campana.cuentas.join(', ')}</h2>
        <p className="text-xs text-neutral-500">{empezada
          ? 'Ya empezó: MercadoLibre solo deja cambiar el nombre y hasta cuándo dura.'
          : 'Todavía no empezó: si la pones a empezar hoy, arranca ya y puedes agregarle publicaciones.'}</p>
        <label className="block space-y-1"><span className="text-xs text-neutral-500">Nombre</span>
          <input value={f.nombre} maxLength={60} onChange={e => setF({ ...f, nombre: e.target.value })} className="w-full border border-neutral-300 rounded-lg px-2 py-1.5" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1"><span className="text-xs text-neutral-500">Desde</span>
            <input type="date" value={f.desde} min={empezada ? undefined : minDesde} disabled={empezada} onChange={e => {
              const desde = e.target.value
              const tope = sumarDias(desde, MAX_DIAS_CAMPANA - 1)
              setF({ ...f, desde, hasta: f.hasta < desde ? desde : f.hasta > tope ? tope : f.hasta })
            }} className="w-full border border-neutral-300 rounded-lg px-2 py-1.5 disabled:bg-neutral-100 disabled:text-neutral-500" />
          </label>
          <label className="space-y-1"><span className="text-xs text-neutral-500">Hasta</span>
            <input type="date" value={f.hasta} min={empezada ? minDesde : f.desde} max={maxHasta} onChange={e => setF({ ...f, hasta: e.target.value })}
              className="w-full border border-neutral-300 rounded-lg px-2 py-1.5" />
          </label>
        </div>
        <p className="text-xs text-neutral-400">Como máximo {MAX_DIAS_CAMPANA} días desde el inicio (hasta el {maxHasta.split('-').reverse().slice(0, 2).join('/')}).</p>
        {error && <p className="text-red-700 text-xs">{error}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onCerrar} className="btn-ghost text-sm">Cancelar</button>
          <button onClick={guardar} disabled={enviando || f.nombre.trim().length < 3 || f.hasta > maxHasta || f.hasta < f.desde || (!empezada && f.desde < minDesde)} className="btn-primary text-sm">
            {enviando ? 'Guardando…' : 'Guardar en MercadoLibre'}
          </button>
        </div>
      </div>
    </div>
  )
}

const ACCION_TXT: Record<string, string> = { crear_campana: 'Creó la campaña', editar_campana: 'Editó la campaña', borrar_campana: 'Borró la campaña', agregar: 'Agregó a', quitar: 'Sacó de' }

/** Lo hecho desde el sistema en ML (quién, cuándo, a qué precio y cómo terminó), plegado. */
function Historial({ historial }: { historial: AccionHecha[] }) {
  const [abierto, setAbierto] = useState(false)
  if (!historial.length) return null
  return (
    <div className="rounded-xl border border-neutral-200 bg-white text-xs">
      <button onClick={() => setAbierto(a => !a)} className="w-full flex items-center gap-2 px-4 py-2 text-neutral-600 hover:bg-neutral-50">
        <span className={`transition-transform ${abierto ? 'rotate-90' : ''}`}>▶</span>
        Cambios hechos desde el sistema ({historial.length})
      </button>
      {abierto && (
        <ul className="divide-y divide-neutral-100 border-t border-neutral-100">
          {historial.map(a => (
            <li key={a.id} className="px-4 py-1.5 flex flex-wrap gap-x-2">
              <span className="text-neutral-400">{cuando(a.creado_at)}</span>
              <span className="text-neutral-700">{a.usuario ?? '—'}</span>
              <span>{ACCION_TXT[a.accion] ?? a.accion} <b>{a.campana_nombre ?? ''}</b></span>
              {a.item_id && <span className="text-neutral-500">{a.item_id}{a.precio != null ? ` · ${usd(a.precio_antes)} → ${usd(a.precio)}` : ''}</span>}
              {a.resultado === 'error' && <span className="text-red-700">error: {a.detalle}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
