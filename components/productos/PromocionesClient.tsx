'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { PageHeader, EmptyState, FilterPills, Pagination } from '@/components/ui'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import {
  envioPorTransportista, topeDescuento, unidadesParaGratis, huecoVariasUnidades, textoHueco, tierFor, parseShippingTable, tablasEnvio, type TablasEnvio, type EstadoEnvio,
} from '@/lib/mlShipping'
import { mlNetFor, type VeRate } from '@/lib/pricingVE'
import type { CampanaML, PromoDeItem } from '@/lib/promocionesML'

// Promociones de MercadoLibre (migraciones 094 y 097).
//  Fase 1: ver campañas, envío gratis por transportista, descuento máximo y unidades para el envío gratis.
//  Fase 2: agregar publicaciones a una campaña (de ML o propia) o sacarlas, crear y borrar campañas propias;
//          siempre con vista previa (precio, envío, unidades, margen) y registro de quién hizo qué.
//  Fase 3: margen neto al precio de la promoción y sugerencias por campaña.

export interface CampanaVista extends CampanaML { conexionId: number; cuentas: string[]; adentro: number; candidatas: number
  pctDefecto?: number | null   // campañas propias: el % que se propone al agregar (se elige al crearla)
}
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
// Piso de MercadoLibre (VE, oct-2026): no se publica ni se promociona por debajo de $2. Con un % que lo
// cruzaría, el precio queda en $2 (el descuento real es menor); publicada en $2 o menos no puede entrar.
const PISO_ML = 2
const precioConPiso = (publicado: number, pct: number) => Math.max(PISO_ML, redondear(publicado * (1 - pct / 100)))
const pctReal = (publicado: number, precio: number) => publicado > 0 ? (1 - precio / publicado) * 100 : 0
// Precio de promo que NO le quita el envío gratis (pedido del dueño 17-10): si con el % pedido bajaría del
// mínimo de TEALCA para su peso, queda justo en ese mínimo = el máximo descuento seguro. Solo para las que
// hoy tienen envío gratis; perder solo ZOOM no se ajusta (es advertencia). `sinMargen`: ya está en el mínimo.
// Desde el 24-10 cuida también 2 y 3 unidades: comprando varias el paquete cambia de rango de peso y el mínimo por
// unidad puede ser mayor (2 × 0,9 kg = 1,8 kg pide $20 → $10 c/u, más que los $7 de 1 unidad).
const precioSeguro = (publicado: number, pct: number, base: { estado: EstadoEnvio; minTealca: number | null },
  peso: number | null, tablas: TablasEnvio) => {
  const pedido = precioConPiso(publicado, pct)
  let min = base.estado === 'ambas' || base.estado === 'tealca' ? base.minTealca : null
  if (min != null && peso != null && peso > 0) {
    for (let n = 2; n <= 3; n++) {
      const t = tierFor(peso * n, tablas.tealca)
      if (t && publicado * n >= t.minPrice) min = Math.max(min, Math.ceil(t.minPrice / n * 100) / 100)
    }
  }
  if (min == null || pedido >= min) return { precio: pedido, ajustada: false, sinMargen: false }
  if (publicado <= min) return { precio: publicado, ajustada: false, sinMargen: true }
  return { precio: Math.max(PISO_ML, redondear(min)), ajustada: true, sinMargen: false }
}
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
  const confirmar = useConfirm()
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
  // ZOOM y TEALCA de Ajustes (19-10: antes fijas en el código).
  const tablas = useMemo(() => tablasEnvio(ml), [ml])

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
    const envio = envioPorTransportista(f.peso, actual, tablas)
    const sinPromo = envioPorTransportista(f.peso, f.precio, tablas)
    return {
      ...f, enPromo, actual, envio,
      envioBase: sinPromo,   // al precio publicado: contra esto se mide lo que hace un descuento nuevo
      // Lo que le hace la promo al envío (17-10): sin promo tenía envío gratis y con la promo queda a cobro a
      // destino (quitaEnvio), o tenía ZOOM y queda solo TEALCA (quitaZoom: sigue gratis, es advertencia).
      quitaEnvio: !!enPromo && envio.estado === 'destino' && (sinPromo.estado === 'ambas' || sinPromo.estado === 'tealca'),
      quitaZoom: !!enPromo && sinPromo.estado === 'ambas' && envio.estado === 'tealca',
      // 1 unidad sigue gratis pero comprando 2 o 3 no, por la promo (24-10): cuenta como "le quita el envío gratis".
      hueco: enPromo ? huecoVariasUnidades(f.peso, actual, f.precio, tablas) : null,
      uTealca: envio.estado === 'destino' ? unidadesParaGratis(f.peso, actual, tablas.tealca) : null,
      uZoom: envio.estado === 'destino' || envio.estado === 'tealca' ? unidadesParaGratis(f.peso, actual, tablas.zoom) : null,
      descuento: enPromo && f.precio > 0 ? (1 - actual / f.precio) * 100 : 0,
      candidatas: f.promos.filter(p => p.estado === 'candidate'),
      topeAmbas: topeDescuento(f.precio, envio.minZoom),
      topeTealca: topeDescuento(f.precio, envio.minTealca),
      topePiso: topeDescuento(f.precio, PISO_ML),   // hasta cuánto se puede bajar sin cruzar los $2 de ML
      margen: margenA(f, actual),
    }
  }), [filas, margenA, tablas])
  type Vista = typeof vistas[number]
  const porClave = useMemo(() => new Map(vistas.map(v => [clave(v), v])), [vistas])

  // Sugerencias: las que pueden entrar y que, con el % propuesto, NO pierden el envío gratis (y no quedan
  // bajo el mínimo que acepta ML). De ML: las que ML invita. Propia: las de la cuenta que todavía no están.
  // El margen no filtra (muchas publicaciones no tienen costo): se ve como aviso en la vista previa.
  const pctDe = (c: CampanaVista) => c.pctDefecto ?? pctSug
  const sugeridas = (c: CampanaVista) => vistas.filter(v => {
    if (v.conexionId !== c.conexionId) return false
    const p = v.promos.find(x => x.campana === c.id)
    if (p?.estado === 'started') return false
    if (c.tipo !== 'SELLER_CAMPAIGN' && p?.estado !== 'candidate') return false
    if (v.precio <= PISO_ML) return false
    if (v.envioBase.estado === 'sin_peso') return false
    // Con el máximo seguro: las que no aguantarían el % se proponen ajustadas (si aguantan al menos 1%).
    const s = precioSeguro(v.precio, pctDe(c), v.envioBase, v.peso, tablas)
    if (s.sinMargen || pctReal(v.precio, s.precio) < 1) return false
    return !(p?.minimo != null && s.precio < p.minimo)
  })

  const [campCon, campId] = campana ? campana.split('|') : ['', '']
  const base = vistas.filter(v => (!cuenta || v.cuenta === cuenta)
    && (!campana || (String(v.conexionId) === campCon && v.promos.some(p => p.campana === campId))))
  const cuenta_ = (fn: (v: Vista) => boolean) => base.filter(fn).length
  const filtros: Record<Filtro, (v: Vista) => boolean> = {
    todas: () => true,
    adentro: v => !!v.enPromo,
    candidatas: v => v.candidatas.length > 0,
    quita: v => v.quitaEnvio || !!v.hueco,
    margen: v => v.margen != null && v.margen < margenMin,
    tealca: v => v.quitaZoom,
    destino: v => v.envio.estado === 'destino',
    sin_peso: v => v.envio.estado === 'sin_peso',
  }
  const q = buscar.trim().toLowerCase()
  const lista = base.filter(filtros[filtro]).filter(v => !q || v.titulo.toLowerCase().includes(q) || v.id.toLowerCase().includes(q) || (v.producto ?? '').toLowerCase().includes(q))
  const visibles = lista.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA)
  const toggle = (k: string) => setSel(s => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n })
  // Con una campaña elegida, las que YA están en ella no se seleccionan (no hay nada que agregar).
  const campElegida = campana ? campanas.find(c => `${c.conexionId}|${c.id}` === campana) ?? null : null
  const enCampElegida = (v: Vista) => campElegida ? v.promos.find(p => p.campana === campElegida.id && p.estado === 'started') ?? null : null
  const seleccionables = visibles.filter(v => !enCampElegida(v))
  const todasVisibles = seleccionables.length > 0 && seleccionables.every(v => sel.has(clave(v)))

  const llamar = async (url: string, init: RequestInit, ok: (d: Record<string, unknown>) => string | { error: string }, falla: string) => {
    setError(null); setAviso(null)
    const r = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...init })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setError(d.error ?? falla); return null }
    const m = ok(d)
    if (typeof m === 'string') setAviso(m); else setError(m.error)
    router.refresh()
    return d
  }

  const actualizarML = async (notaME?: string) => {
    setBusy('ml'); setError(null); setAviso('Leyendo campañas y precios de MercadoLibre… puede tardar un minuto.')
    const r = await fetch('/api/promociones/actualizar', { method: 'POST' })
    const d = await r.json().catch(() => ({}))
    setBusy(null)
    if (!r.ok) { setAviso(null); setError(d.error ?? 'No se pudo leer MercadoLibre. Revisa que las cuentas sigan conectadas y prueba de nuevo.'); return }
    const res = (d.resultado ?? []) as { cuenta: string; ok: boolean; publicaciones?: number; campanas?: number; error?: string }[]
    setAviso(res.map(x => x.ok ? `${x.cuenta}: ${x.publicaciones} publicaciones, ${x.campanas} campañas` : `${x.cuenta}: error (${x.error})`).join(' · ') || 'Sin cuentas activas')
    if (notaME) setError(notaME)
    router.refresh()
  }
  // "Traer ME y ML" (como Traer ME en Por confirmar): la PC de Pagos ME lee los pesos del portal (1-3 min);
  // cuando terminan todos sus perfiles, se lee MercadoLibre. Si la PC no responde en 5 min, solo ML.
  // 17-10: ML se lee ENSEGUIDA (publicaciones nuevas, campañas y precios); los pesos los trae la PC de Pagos ME
  // por su lado (puede tardar varios minutos) y, al llegar, la página se actualiza sola. Antes ML esperaba a la PC
  // y, si la PC tardaba, nunca se leía.
  const [pedidoME, setPedidoME] = useState<{ id: number; desde: number } | null>(null)
  const [estadoPesos, setEstadoPesos] = useState<string | null>(null)
  const traerTodo = async () => {
    if (conPagosME && !pedidoME) {
      const r = await fetch('/api/promociones/pesos', { method: 'POST' }).catch(() => null)
      const d = await r?.json().catch(() => null)
      if (r?.ok && d?.pedido) { setPedidoME({ id: d.pedido, desde: Date.now() }); setEstadoPesos('trayendo con la PC de Pagos ME…') }
      else setEstadoPesos('no se pudo pedir a la PC de Pagos ME')
    }
    await actualizarML()
  }
  useEffect(() => {
    if (!pedidoME) return
    const t = setInterval(async () => {
      const r = await fetch(`/api/promociones/pesos?pedido=${pedidoME.id}`, { cache: 'no-store' }).catch(() => null)
      const d = await r?.json().catch(() => null) as { hechos: number; perfiles: number; errores: string[] } | null
      const vencido = Date.now() - pedidoME.desde > 15 * 60_000
      if (d && d.hechos < d.perfiles && !vencido) { setEstadoPesos(`trayendo con la PC de Pagos ME… ${d.hechos} de ${d.perfiles} cuentas`); return }
      clearInterval(t)
      setPedidoME(null)
      setEstadoPesos(vencido && (!d || d.hechos < d.perfiles) ? 'la PC de Pagos ME no terminó en 15 min (¿está prendida?)'
        : d?.errores.length ? `con errores: ${d.errores.join(' · ')}` : null)
      router.refresh()
    }, 10_000)
    return () => clearInterval(t)
  }, [pedidoME])   // eslint-disable-line react-hooks/exhaustive-deps
  const sacar = async (v: Vista, p: PromoDeItem & { nombre: string }) => {
    const camp = campanas.find(c => c.conexionId === v.conexionId && c.id === p.campana)
    if (!await confirmar({
      title: 'Quitar promo',
      message: `"${v.titulo}" sale de «${p.nombre}» en MercadoLibre.\n\nVuelve a su precio publicado (${usd(v.precio)}), salvo que esté en otra promoción.`,
      confirmText: 'Quitar promo', danger: true,
    })) return
    setBusy(`sacar-${clave(v)}`)
    await llamar('/api/promociones/acciones', {
      method: 'POST', body: JSON.stringify({ accion: 'quitar', conexionId: v.conexionId, campana: { id: p.campana, tipo: camp?.tipo ?? 'DEAL', nombre: p.nombre }, items: [{ id: v.id }] }),
    }, d => d.error
      ? { error: `"${v.titulo}" no salió de «${p.nombre}»: ${((d.resultados as { error?: string }[])?.[0]?.error) ?? 'MercadoLibre no lo aceptó'}` }
      : (d.resultados as { precioTarda?: boolean }[])?.[0]?.precioTarda
        ? `"${v.titulo}" salió de «${p.nombre}». MercadoLibre tarda unos minutos en volver a mostrar su precio normal.`
        : `"${v.titulo}" salió de «${p.nombre}» y se comprobó en MercadoLibre.`,
      `No se pudo sacar "${v.titulo}" de «${p.nombre}».`)
    setBusy(null)
  }
  const borrarCampana = async (c: CampanaVista) => {
    if (!await confirmar({
      title: 'Borrar campaña',
      message: `Se borra «${c.nombre}» de MercadoLibre (${c.cuentas.join(', ')}).\n\nAntes se saca cada publicación que tiene (${c.adentro}) para que vuelva a su precio. No se puede deshacer.`,
      confirmText: 'Borrar campaña', danger: true,
    })) return
    setBusy(`borrar-${c.id}`)
    await llamar(`/api/promociones/campanas?conexion=${c.conexionId}&id=${encodeURIComponent(c.id)}&nombre=${encodeURIComponent(c.nombre)}`,
      { method: 'DELETE' }, () => `Campaña «${c.nombre}» borrada en MercadoLibre; sus publicaciones volvieron a su precio.`,
      `No se pudo borrar la campaña «${c.nombre}».`)
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
          <button onClick={() => setModal({ tipo: 'nueva' })} disabled={!!busy || sinFoto} className="btn-secondary text-sm whitespace-nowrap">+ Campaña propia</button>
          <button onClick={traerTodo} disabled={!!busy} className="btn-primary text-sm whitespace-nowrap"
            title={conPagosME ? 'Primero los pesos del portal de MercadoEnvíos (PC de Pagos ME) y después campañas y precios de MercadoLibre' : 'Campañas y precios de MercadoLibre'}>
            {busy === 'ml' ? 'Trayendo ML…' : conPagosME ? 'Traer ME y ML' : 'Actualizar desde MercadoLibre'}
          </button>
        </>} />

      <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3 text-xs text-neutral-600 flex flex-wrap items-center gap-x-5 gap-y-1">
        {cuentas.map(c => (
          <span key={c.id}>
            <b className="text-neutral-800">{c.nombre}</b> · MercadoLibre {cuando(c.actualizado_at)}
            {c.error && <span className="text-red-700"> · error: {c.error}</span>}
          </span>
        ))}
        <span>Pesos del portal: {estadoPesos
          ? <span className={pedidoME ? 'text-sky-700' : 'text-amber-700'}>{estadoPesos}</span>
          : <>{cuando(pesosAl)}{conPagosME ? ' (se traen solos 1 vez al día)' : ''}</>}</span>
        <label className="ml-auto flex items-center gap-1.5" title="Para las sugerencias y el filtro de margen bajo">
          Margen mínimo
          <input type="number" min={0} max={90} value={margenMin} onChange={e => guardarMargen(Math.max(0, Math.min(90, Number(e.target.value) || 0)))}
            className="w-14 border border-neutral-300 rounded px-1.5 py-0.5 text-right" />%
        </label>
      </div>

      {error && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>}
      {aviso && <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-800">{aviso}</div>}

      {sinFoto ? (
        <EmptyState message={`Todavía no se leyó nada de MercadoLibre. Toca "${conPagosME ? 'Traer ME y ML' : 'Actualizar desde MercadoLibre'}".`} />
      ) : <>
        {campanas.length > 0 && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
              <span>Sugerencias con</span>
              <input type="number" min={1} max={80} value={pctSug} onChange={e => setPctSug(Math.max(1, Math.min(80, Number(e.target.value) || 10)))}
                className="w-14 border border-neutral-300 rounded px-1.5 py-0.5 text-right" />
              <span>% de descuento: las que con ese descuento siguen con envío gratis (si alguna pierde ZOOM se avisa al agregar).</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {campanas.map(c => {
                const k = `${c.conexionId}|${c.id}`
                const propia = c.tipo === 'SELLER_CAMPAIGN'
                const sug = sugeridas(c)
                return (
                  <div key={k} className={`rounded-xl border px-4 py-3 bg-white ${campana === k ? 'border-emerald-500 ring-1 ring-emerald-500' : 'border-neutral-200'}`}>
                    <button onClick={() => { setCampana(campana === k ? '' : k); setPagina(1); setSel(new Set()) }} className="w-full text-left">
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-medium text-neutral-900">{c.nombre}</div>
                        <span className="text-[11px] text-neutral-400 whitespace-nowrap">{propia ? 'propia' : c.tipo}{c.estado !== 'started' ? ` · ${c.estado}` : ''}</span>
                      </div>
                      <div className="text-xs text-neutral-500 mt-0.5">{propia && c.pctDefecto ? <><b className="text-neutral-700">{c.pctDefecto}%</b> · </> : null}{fecha(c.inicio)} → {fecha(c.fin)}{!propia && <> · entrar hasta {fecha(c.limite)}</>} · {c.cuentas.join(', ')}</div>
                      <div className="text-sm mt-2"><b>{c.adentro}</b> adentro{!propia && <> · <b>{c.candidatas}</b> pueden entrar</>}</div>
                    </button>
                    <div className="flex flex-wrap items-center gap-3 mt-2 text-xs">
                      {sug.length > 0 && (
                        <button onClick={() => setModal({ tipo: 'agregar', claves: sug.map(clave), campana: k, pct: pctDe(c) })}
                          className="btn-secondary text-xs px-2.5 py-1">Ver {sug.length} sugerida{sug.length === 1 ? '' : 's'}</button>
                      )}
                      {propia && c.adentro > 0 && (
                        <button onClick={() => setModal({ tipo: 'agregar', campana: k, pct: pctDe(c),
                          claves: vistas.filter(v => v.conexionId === c.conexionId && v.promos.some(p => p.campana === c.id && p.estado === 'started')).map(clave) })}
                          disabled={!!busy} className="btn-secondary text-xs px-2.5 py-1"
                          title="Cambiar el precio de las que ya están en esta campaña (por ejemplo, de 10% a 15%)">Cambiar % de las {c.adentro}</button>
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
            { value: 'tealca', label: 'La promo quita ZOOM', count: cuenta_(filtros.tealca) },
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
                      for (const v of seleccionables) { if (todasVisibles) n.delete(clave(v)); else n.add(clave(v)) }
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
                  const yaEn = enCampElegida(v)
                  return (
                    <tr key={k} className={`border-t border-neutral-100 align-top ${sel.has(k) ? 'bg-emerald-50/60' : ''}`}>
                      <td className="px-3 py-2 text-center">
                        {yaEn
                          ? <span className="text-emerald-600" title={`Ya está en «${campElegida!.nombre}»`}>✓</span>
                          : <input type="checkbox" checked={sel.has(k)} onChange={() => toggle(k)} />}
                      </td>
                      <td className="px-3 py-2 max-w-[300px]">
                        <a href={urlML(v.id)} target="_blank" rel="noreferrer" className="text-neutral-900 hover:underline line-clamp-2">{v.titulo}</a>
                        {campElegida && (yaEn
                          ? <div className="text-[11px] font-medium text-emerald-700">✓ Ya en {campElegida.nombre}{yaEn.precio != null ? ` a ${usd(yaEn.precio)}` : ''}</div>
                          : <div className="text-[11px] font-medium text-sky-700">Puede entrar a {campElegida.nombre}</div>)}
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
                          {!v.quitaEnvio && v.hueco && <div className="mt-0.5 text-red-700 font-medium">⚠ {textoHueco(v.hueco)}</div>}
                          {v.quitaZoom && <div className="mt-0.5 text-amber-800 font-medium">⚠ La promo le quita ZOOM (sigue gratis por TEALCA)</div>}
                          {/* Botón chico con borde (antes un enlace gris que se confundía con texto, 2026-10-17). */}
                          <button onClick={() => sacar(v, v.enPromo!)} disabled={!!busy}
                            className="mt-1 inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-neutral-300 bg-white px-2 py-0.5 text-[11px] font-medium text-neutral-700 shadow-sm transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-700 disabled:opacity-50">
                            {busy === `sacar-${k}` ? 'Quitando…' : '✕ Quitar promo'}
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
                        {/* Piso de $2 de ML: se muestra cuando limita más que el envío gratis. */}
                        {(v.topePiso == null || v.topePiso < (v.topeTealca ?? 100)) && (
                          <div className="text-sky-700">{v.topePiso == null || v.topePiso <= 0 ? 'no entra a promos (≤ $2)' : <>piso $2: hasta <b>{pct(v.topePiso)}</b></>}</div>
                        )}
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
          campanas={campanas} margenA={margenA} margenMin={margenMin} tablas={tablas}
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

type VistaModal = FilaPromo & { envio: ReturnType<typeof envioPorTransportista>; envioBase: ReturnType<typeof envioPorTransportista> }

/** Vista previa antes de agregar a una campaña: precio nuevo, envío antes → después, unidades y margen. */
function AgregarModal({ modal, setModal, filas, campanas, margenA, margenMin, tablas, onHecho }: {
  modal: Extract<Modal, { tipo: 'agregar' }>; setModal: (m: Modal) => void; filas: VistaModal[]
  campanas: CampanaVista[]; margenA: (f: FilaPromo, precio: number) => number | null; margenMin: number; tablas: TablasEnvio
  onHecho: (msg: string, err?: string) => void
}) {
  const confirmarAviso = useConfirm()
  const [enviando, setEnviando] = useState(false)
  // Lo que respondió ML por publicación. Si dijo "no es una rebaja real", se puede reintentar A MANO con otro %.
  const [resultados, setResultados] = useState<Record<string, { ok: boolean; precio?: number; manda?: number | null; error?: string; noCreible?: boolean; porConfirmar?: boolean }>>({})
  const [reintento, setReintento] = useState<Record<string, number>>({})
  // Las que con este % quedan SIN envío gratis quedan fuera, salvo que se pida agregarlas igual.
  // Perder solo ZOOM (sigue gratis por TEALCA) no bloquea: es una advertencia fuerte.
  const [conPierden, setConPierden] = useState(false)
  // Varias campañas seguidas (20-10, pedido del dueño): al terminar una, la ventana sigue abierta para agregar las
  // mismas publicaciones a otra. Aquí quedan las ya hechas (los datos de la pantalla no se recargan hasta cerrar).
  const [hechas, setHechas] = useState<{ clave: string; nombre: string; ok: number; mal: number; okIds: string[] }[]>([])
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
    .filter(o => (o.n > 0 || `${o.c.conexionId}|${o.c.id}` === modal.campana) && !hechas.some(h => h.clave === `${o.c.conexionId}|${o.c.id}`))
  const camp = campanas.find(c => `${c.conexionId}|${c.id}` === modal.campana) ?? null
  const propia = camp?.tipo === 'SELLER_CAMPAIGN'
  // ML no guarda publicaciones en una campaña que todavía no empezó (responde "ok" pero no queda).
  // El estado guardado puede ser una foto de antes del inicio (27-10): si la fecha ya llegó, se deja intentar
  // (el servidor le pregunta a ML en el momento y frena si de verdad no empezó).
  const sinEmpezar = !!camp && camp.estado !== 'started' && (!camp.inicio || Date.parse(camp.inicio) > Date.now())

  const filasPrev = filas.map(f => {
    const seguro = conPierden ? { precio: precioConPiso(f.precio, modal.pct), ajustada: false, sinMargen: false }
      : precioSeguro(f.precio, modal.pct, f.envioBase, f.peso, tablas)
    const precio = seguro.precio
    const ajustada = seguro.ajustada
    const enPiso = !ajustada && f.precio > PISO_ML && precio === PISO_ML && redondear(f.precio * (1 - modal.pct / 100)) < PISO_ML
    const bajoPiso = f.precio <= PISO_ML
    const cand = camp ? f.promos.find(p => p.campana === camp.id) : undefined
    const yaAdentro = cand?.estado === 'started'
    // Ya en una campaña PROPIA a otro precio: se le cambia el precio (de 10% a 15%, 17-10).
    const cambio = yaAdentro && propia && cand?.precio != null && Math.abs(cand.precio - precio) >= 0.011
    const puede = !!camp && (cambio || (!yaAdentro && (propia || cand?.estado === 'candidate')))
    const bajoMin = cand?.minimo != null && precio < cand.minimo
    // Siempre contra el envío AL PRECIO PUBLICADO (no contra el de otra promo que ya le haya bajado el precio).
    const base = f.envioBase
    const despues = envioPorTransportista(f.peso, precio, tablas)
    // Comprando 2 o 3 pierde el envío gratis por la promo (24-10). Sin "agregarlas igual" el precio ya viene ajustado.
    const hueco = huecoVariasUnidades(f.peso, precio, f.precio, tablas)
    const sinGratis = (despues.estado === 'destino' && base.estado !== 'destino' && base.estado !== 'sin_peso') || !!hueco
    const pierdeZoom = base.estado === 'ambas' && despues.estado === 'tealca'
    const pierde = sinGratis || pierdeZoom
    const unidades = despues.estado === 'destino' ? unidadesParaGratis(f.peso, precio, tablas.tealca) : null
    const margen = margenA(f, precio)
    // Hasta qué % aguanta: con ZOOM (mínimo de ZOOM) y con algún envío gratis (mínimo de TEALCA).
    const topeZoom = base.estado === 'ambas' ? topeDescuento(f.precio, base.minZoom) : null
    const tope = base.estado === 'ambas' || base.estado === 'tealca' ? topeDescuento(f.precio, base.minTealca) : null
    const motivo = !camp ? null : yaAdentro && !cambio ? `Ya está en la campaña${cand?.precio != null ? ` · ${usd(cand.precio)}` : ''}` : !puede ? 'ML no la invita a esta campaña'
      : bajoPiso ? `Bajo $${PISO_ML}: ML no la acepta` : bajoMin ? `ML acepta desde ${usd(cand!.minimo)}`
      : seguro.sinMargen ? 'Sin margen: perdería el envío gratis' : null
    const advertencia = motivo ? null
      : ajustada ? `Ajustada a −${pct(pctReal(f.precio, precio))} (envío gratis)`
      : pierdeZoom ? `⚠ Solo TEALCA${topeZoom ? ` · ZOOM hasta ${pct(topeZoom)}` : ''}`
      : sinGratis ? (hueco && despues.estado !== 'destino' ? `⚠ Comprando ${hueco.unidades}: sin envío gratis` : '⚠ Sin envío gratis')
      : base.estado === 'sin_peso' ? 'Sin peso: envío sin verificar' : null
    // Ya está en OTRA promoción: queda en las dos y ML cobra la más baja.
    const otra = f.promos.find(p => p.estado === 'started' && p.campana !== camp?.id)
      ?? (() => { const h = [...hechas].reverse().find(x => x.okIds.includes(f.id)); return h ? { nombre: h.nombre, precio: null } : undefined })()
    return { f, precio, enPiso, despues, pierde, sinGratis, pierdeZoom, unidades, margen, motivo, advertencia, otra, tope,
      cambio, antes: cambio ? cand!.precio! : null, ajustada }
  })
  const validas = camp && !sinEmpezar ? filasPrev.filter(x => !x.motivo && !resultados[x.f.id]?.ok) : []

  // De a TANDA por pedido (2026-10-17): cada publicación tarda ~2 s (se agrega y se comprueba con el precio
  // real) y el servidor corta la espera al minuto; con 28 de una vez la pantalla perdía la respuesta.
  const TANDA = 10
  const [avance, setAvance] = useState<{ hechas: number; total: number; comprobando?: number } | null>(null)
  const [enCola, setEnCola] = useState<Set<string>>(new Set())
  // Mientras agrega no se cierra (cerrar o recargar cortaba las tandas que faltaban, 2026-10-17).
  useEffect(() => {
    if (!enviando) return
    const avisar = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', avisar)
    return () => window.removeEventListener('beforeunload', avisar)
  }, [enviando])
  const enviar = async (items: { id: string; precio: number; precioAntes: number; cambio?: boolean }[]) => {
    if (!camp || !items.length) return
    setEnviando(true); setEnCola(new Set(items.map(x => x.id)))
    type Res = { id: string; ok: boolean; precio?: number; manda?: number | null; error?: string; noCreible?: boolean; porConfirmar?: boolean }
    const todos: Res[] = []
    const nuevos = { ...resultados }
    for (let i = 0; i < items.length; i += TANDA) {
      const tanda = items.slice(i, i + TANDA)
      setAvance({ hechas: i, total: items.length })
      const res: Res[] = []
      for (const accion of ['agregar', 'cambiar'] as const) {
        const parte = tanda.filter(x => !!x.cambio === (accion === 'cambiar')).map(({ cambio: _c, ...x }) => x)
        if (!parte.length) continue
        const r = await fetch('/api/promociones/acciones', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accion, conexionId, campana: { id: camp.id, tipo: camp.tipo, nombre: camp.nombre, estado: camp.estado }, items: parte }),
        }).catch(() => null)
        const d = r ? await r.json().catch(() => ({})) : {}
        if (r?.status === 400) {   // la campaña no empezó u otro rechazo de todo el pedido: no sigue
          setEnviando(false); setAvance(null); setEnCola(new Set())
          return onHecho('', d.error ?? `No se pudo agregar a «${camp.nombre}».`)
        }
        res.push(...(r?.ok ? d.resultados as Res[]
          // Sin respuesta (se cortó la espera o la conexión): pudieron haber entrado; no se reintenta solo.
          : parte.map(x => ({ id: x.id, ok: false, error: 'No llegó la respuesta: puede que haya entrado. Toca «Traer ME y ML» para confirmarlo antes de reintentar.' }))))
      }
      for (const x of res) nuevos[x.id] = x
      todos.push(...res)
      setResultados({ ...nuevos })
      setAvance({ hechas: Math.min(i + TANDA, items.length), total: items.length })
    }
    // Las que ML aceptó pero todavía no reflejaba: se vuelven a mirar a los ~10 s y a los ~30 s (18-10).
    for (const [espera, final] of [[10_000, false], [20_000, true]] as const) {
      const pend = todos.filter(x => x.ok && x.porConfirmar)
      if (!pend.length) break
      setAvance({ hechas: items.length, total: items.length, comprobando: pend.length })
      await new Promise(r => setTimeout(r, espera))
      const r = await fetch('/api/promociones/acciones', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'verificar', conexionId, final, campana: { id: camp.id, tipo: camp.tipo, nombre: camp.nombre },
          items: pend.map(x => ({ id: x.id, precio: x.precio ?? items.find(i => i.id === x.id)!.precio })) }),
      }).catch(() => null)
      const d = r?.ok ? await r.json().catch(() => null) : null
      for (const v of (d?.resultados ?? []) as { id: string; estado: 'ok' | 'pendiente' | 'no' }[]) {
        const x = todos.find(t => t.id === v.id)
        if (!x) continue
        if (v.estado === 'ok') x.porConfirmar = false
        else if (v.estado === 'no') Object.assign(x, { ok: false, porConfirmar: false, error: 'MercadoLibre respondió que sí, pero el precio no apareció en la publicación: no entró a la campaña. Reintenta.' })
        nuevos[x.id] = { ...x }
      }
      // Sin respuesta de la comprobación: quedan "por confirmar" (Traer de ML lo aclara).
      setResultados({ ...nuevos })
    }
    setEnviando(false); setAvance(null); setEnCola(new Set())
    // Todo bien: se cierra. Con errores (o sin confirmar) queda abierto para ver el motivo y reintentar a mano.
    // Todo bien: no se cierra (20-10): queda anotada y se puede elegir otra campaña para las mismas publicaciones.
    if (todos.every(x => x.ok && !x.porConfirmar) && !todos.some(x => x.manda)) pasarAOtra(nuevos)
  }
  /** Anota la campaña actual como hecha (con lo que respondió ML) y deja elegir otra. */
  const pasarAOtra = (res: typeof resultados = resultados) => {
    if (!camp) return
    const r = Object.values(res)
    if (r.length) setHechas(h => [...h.filter(x => x.clave !== modal.campana),
      { clave: modal.campana, nombre: camp.nombre, ok: r.filter(x => x.ok).length, mal: r.filter(x => !x.ok).length,
        okIds: Object.entries(res).filter(([, x]) => x.ok).map(([id]) => id) }])
    setResultados({}); setReintento({}); setConPierden(false)
    setModal({ ...modal, campana: '' })
  }
  const confirmar = async () => {
    const sinGratis = validas.filter(x => x.sinGratis).length
    const zoom = validas.filter(x => x.pierdeZoom).length
    const bajos = validas.filter(x => x.margen != null && x.margen < margenMin).length
    const avisos = [sinGratis && `• ${sinGratis} queda${sinGratis === 1 ? '' : 'n'} SIN envío gratis (cobro a destino, con 1 unidad o comprando 2 o 3).`,
      zoom && `• ${zoom} pierde${zoom === 1 ? '' : 'n'} ZOOM: solo tendrá${zoom === 1 ? '' : 'n'} envío gratis por TEALCA. En Preguntas y Mensajes se verá así mientras dure la promoción.`,
      bajos && `• ${bajos} queda${bajos === 1 ? '' : 'n'} con margen menor a ${margenMin}%.`].filter(Boolean).join('\n')
    if (avisos && !await confirmarAviso({
      title: `Revisa antes de agregar a «${camp!.nombre}»`,
      message: `${avisos}\n\n¿Agregar las ${validas.length} igual?`,
      confirmText: `Agregar ${validas.length}`, cancelText: 'Volver a revisar',
    })) return
    await enviar(validas.map(x => ({ id: x.f.id, precio: x.precio, precioAntes: x.f.precio, cambio: x.cambio })))
  }
  const reintentar = async (f: VistaModal) => {
    const p = reintento[f.id] ?? Math.min(80, modal.pct + 5)
    const precio = precioConPiso(f.precio, p)
    const e = envioPorTransportista(f.peso, precio, tablas).estado
    const aviso = e === 'destino' && f.envioBase.estado !== 'destino' && f.envioBase.estado !== 'sin_peso'
      ? `Con ${p}% (${usd(precio)}) queda SIN envío gratis: cobro a destino.`
      : (() => { const h = huecoVariasUnidades(f.peso, precio, f.precio, tablas); return h ? `Con ${p}% (${usd(precio)}): ${textoHueco(h)}.` : null })()
      ?? (e === 'tealca' && f.envioBase.estado === 'ambas' ? `Con ${p}% (${usd(precio)}) pierde ZOOM: queda solo TEALCA.` : null)
    if (aviso && !await confirmarAviso({ title: 'Revisa el envío antes de reintentar', message: `${aviso}\n\n¿Reintentar igual?`,
      confirmText: `Reintentar con ${p}%`, cancelText: 'Volver' })) return
    await enviar([{ id: f.id, precio, precioAntes: f.precio, cambio: filasPrev.find(x => x.f.id === f.id)?.cambio }])
  }
  const hayResultados = Object.keys(resultados).length > 0
  const hayAlgo = hayResultados || hechas.length > 0
  const resumen = () => {
    const r = Object.values(resultados)
    const todas = [...hechas.filter(h => h.clave !== modal.campana),
      ...(camp && r.length ? [{ nombre: camp.nombre, ok: r.filter(x => x.ok).length, mal: r.filter(x => !x.ok).length }] : [])]
    const mal = todas.reduce((s, h) => s + h.mal, 0)
    return todas.map(h => `«${h.nombre}»: ${h.ok} agregada${h.ok === 1 ? '' : 's'}${h.mal ? ` · ${h.mal} no entr${h.mal === 1 ? 'ó' : 'aron'}` : ''}`).join(' · ')
      + (mal ? ' (el motivo queda en "Cambios hechos desde el sistema").' : '.')
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => { if (!enviando) { if (hayAlgo) onHecho(resumen()); else setModal(null) } }}>
      <div className="bg-white rounded-xl w-full max-w-4xl max-h-[90vh] overflow-auto p-4 space-y-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Agregar a una campaña · vista previa</h2>
          <button onClick={() => { if (hayAlgo) onHecho(resumen()); else setModal(null) }} disabled={enviando}
            title={enviando ? 'Espera a que termine de agregar' : undefined} className="text-neutral-500 text-sm disabled:opacity-40">Cerrar ✕</button>
        </div>
        {hechas.length > 0 && !mezcla && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            <div>✓ {hechas.map(h => `«${h.nombre}»: ${h.ok} agregada${h.ok === 1 ? '' : 's'}${h.mal ? ` (${h.mal} no entr${h.mal === 1 ? 'ó' : 'aron'})` : ''}`).join(' · ')}</div>
            {!modal.campana && <div className="mt-0.5 text-xs">¿Agregar también a otra campaña? Elígela abajo. Si no, toca <b>Terminar</b>. Si quedan en varias, MercadoLibre cobra la más baja y las otras esperan.</div>}
          </div>
        )}
        {mezcla ? (
          <p className="text-sm text-red-700">Elegiste publicaciones de más de una cuenta. Las campañas son de cada cuenta: filtra por una cuenta y vuelve a seleccionar.</p>
        ) : <>
          <div className="flex flex-wrap items-end gap-3 text-sm">
            <label className="space-y-1"><span className="block text-xs text-neutral-500">Campaña</span>
              <select value={modal.campana} disabled={enviando} onChange={e => {
                const c = campanas.find(x => `${x.conexionId}|${x.id}` === e.target.value)
                if (hayResultados && camp) {   // lo de la campaña anterior queda anotado arriba
                  const r = Object.values(resultados)
                  setHechas(h => [...h.filter(x => x.clave !== modal.campana), { clave: modal.campana, nombre: camp.nombre, ok: r.filter(x => x.ok).length,
                    mal: r.filter(x => !x.ok).length, okIds: Object.entries(resultados).filter(([, x]) => x.ok).map(([id]) => id) }])
                  setResultados({}); setReintento({}); setConPierden(false)
                }
                setModal({ ...modal, campana: e.target.value, pct: c?.pctDefecto ?? modal.pct })
              }} className={`border rounded-lg px-2 py-1.5 min-w-[240px] ${hechas.length && !modal.campana ? 'border-emerald-500 ring-2 ring-emerald-200' : 'border-neutral-300'}`}>
                <option value="">{hechas.length ? 'Elegir otra campaña…' : 'Elegir…'}</option>
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
          {enviando && avance && (
            <div className="sticky top-0 z-10 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>{avance.comprobando
                  ? <>Comprobando en MercadoLibre {avance.comprobando === 1 ? '1 que todavía no se veía' : `${avance.comprobando} que todavía no se veían`}. <b>No cierres esta ventana.</b></>
                  : <>Agregando a «{camp?.nombre}»: <b>{avance.hechas} de {avance.total}</b> listas. <b>No cierres esta ventana</b> hasta que termine.</>}</span>
                {!avance.comprobando && <span className="text-xs text-sky-700">≈ {Math.max(1, Math.ceil((avance.total - avance.hechas) * 2.3 / 60))} min</span>}
              </div>
              <div className="mt-1.5 h-1.5 rounded-full bg-sky-100 overflow-hidden">
                <div className="h-full bg-sky-600 transition-all" style={{ width: `${Math.round(avance.hechas / avance.total * 100)}%` }} />
              </div>
            </div>
          )}
          {camp && filasPrev.some(x => (x.ajustada || x.sinGratis) && !resultados[x.f.id]) && (
            <div className={`rounded-lg border px-3 py-2 text-xs flex flex-wrap items-center gap-x-3 gap-y-1 ${conPierden ? 'bg-red-50 border-red-200 text-red-800' : 'bg-emerald-50 border-emerald-200 text-emerald-900'}`}>
              {conPierden
                ? <span>Con <b>{modal.pct}%</b>, <b>{filasPrev.filter(x => x.sinGratis && !resultados[x.f.id]).length}</b> quedan SIN envío gratis (cobro a destino).</span>
                : <span><b>{filasPrev.filter(x => x.ajustada && !resultados[x.f.id]).length}</b> se ajustan solas al máximo descuento que aguantan sin perder el envío gratis
                    (con {modal.pct}% lo perdían). Lo ves en la columna «Nuevo».</span>}
              <label className="flex items-center gap-1.5 ml-auto">
                <input type="checkbox" checked={conPierden} onChange={e => setConPierden(e.target.checked)} />
                Aplicar el {modal.pct}% completo igual
              </label>
            </div>
          )}
          {camp && filasPrev.some(x => x.pierdeZoom && !x.motivo && !resultados[x.f.id]) && (
            <div className="rounded-lg bg-amber-50 border border-amber-300 px-3 py-2 text-xs text-amber-900">
              ⚠ Con <b>{modal.pct}%</b>, <b>{filasPrev.filter(x => x.pierdeZoom && !x.motivo && !resultados[x.f.id]).length}</b> pierden ZOOM y
              quedan con envío gratis <b>solo por TEALCA</b>. Se agregan, y mientras dure la promoción Preguntas y Mensajes lo muestran así para responder bien.
            </div>
          )}
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
                  <th className="px-2 py-1.5 w-6"></th>
                </tr>
              </thead>
              <tbody>
                {filasPrev.map(x => (
                  <tr key={x.f.id} className={`border-t border-neutral-100 ${x.motivo ? 'opacity-50' : ''}`}>
                    <td className="px-2 py-1.5 max-w-[260px] truncate" title={x.f.titulo}>{x.f.titulo}</td>
                    <td className="px-2 py-1.5 text-right">{usd(x.f.precio)}</td>
                    <td className="px-2 py-1.5 text-right font-medium">{usd(x.precio)}
                      {x.ajustada && <span className="block text-[11px] font-normal text-emerald-700" title="Máximo descuento sin perder el envío gratis">máx. seguro · −{pct(pctReal(x.f.precio, x.precio))}</span>}
                      {x.enPiso && <span className="block text-[11px] font-normal text-sky-700" title={`ML no deja bajar de $${PISO_ML}: queda en el piso`}>piso $2 · −{pct(pctReal(x.f.precio, x.precio))}</span>}
                    </td>
                    <td className="px-2 py-1.5">
                      {x.pierde ? <span className={x.sinGratis ? 'text-red-700' : 'text-amber-800'}>{ENVIO[x.f.envioBase.estado].t} → <b>{ENVIO[x.despues.estado].t}</b></span> : <Chip e={x.despues.estado} />}
                      {x.unidades && <span className="text-emerald-700"> · gratis desde {x.unidades.unidades} u.</span>}
                    </td>
                    <td className={`px-2 py-1.5 text-right ${x.margen == null ? 'text-neutral-400' : x.margen < 0 ? 'text-red-700 font-medium' : x.margen < margenMin ? 'text-amber-700' : ''}`}>
                      {x.margen == null ? '—' : pct(x.margen)}
                    </td>
                    <td className="px-2 py-1.5 text-neutral-500">
                      {enviando && enCola.has(x.f.id) && !resultados[x.f.id] ? <span className="text-sky-700">⏳ en cola…</span>
                        : resultados[x.f.id]?.ok && resultados[x.f.id].porConfirmar ? <span className="text-amber-700">{enviando ? '⏳ ML lo está procesando, comprobando…' : 'ML lo aceptó pero todavía no lo muestra. Revisa en unos minutos con «Traer ME y ML» antes de reintentar.'}</span>
                        : resultados[x.f.id]?.ok ? <span className="text-emerald-700">✓ En la campaña a {usd(resultados[x.f.id].precio)}
                          {resultados[x.f.id].manda != null && <span className="block text-amber-700">Hoy manda otra promoción más baja ({usd(resultados[x.f.id].manda)}): esta se aplica cuando aquella termine.</span>}</span>
                        : resultados[x.f.id] ? <span className="text-red-700">{resultados[x.f.id].error}
                          {resultados[x.f.id].noCreible && (
                            <span className="mt-1 flex items-center gap-1 text-neutral-700">
                              Reintentar con
                              <input type="number" min={1} max={80} value={reintento[x.f.id] ?? Math.min(80, modal.pct + 5)}
                                onChange={e => setReintento({ ...reintento, [x.f.id]: Math.max(1, Math.min(80, Number(e.target.value) || 1)) })}
                                className="w-12 border border-neutral-300 rounded px-1 py-0.5 text-right" />%
                              <span className="text-neutral-500">({usd(precioConPiso(x.f.precio, reintento[x.f.id] ?? Math.min(80, modal.pct + 5)))})</span>
                              <button onClick={() => reintentar(x.f)} disabled={enviando} className="btn-secondary text-[11px] px-2 py-0.5">Reintentar</button>
                            </span>
                          )}</span>
                        : <>{x.motivo ?? (x.cambio ? `${usd(x.antes)} → ${usd(x.precio)}` : x.otra ? <span title={`También en «${x.otra.nombre}»: ML cobra la más baja`}>+ otra promo: {x.otra.precio != null ? usd(x.otra.precio) : `«${x.otra.nombre}» (recién)`}</span> : '')}
                          {x.advertencia && <span className={`block font-medium ${x.ajustada ? 'text-emerald-700' : x.sinGratis ? 'text-red-700' : x.pierdeZoom ? 'text-amber-800' : 'text-neutral-500'}`}>{x.advertencia}</span>}</>}
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      {!resultados[x.f.id] && (
                        <button onClick={() => setModal({ ...modal, claves: modal.claves.filter(k => k !== `${x.f.conexionId}|${x.f.id}`) })}
                          className="text-neutral-400 hover:text-red-700" title="Quitar de esta lista">✕</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-end gap-2">
            <button onClick={() => setModal(null)} className="btn-ghost text-sm">Cancelar</button>
            {hayResultados && camp && <button onClick={() => pasarAOtra()} disabled={enviando} className="btn-secondary text-sm" title="Deja esta campaña como está y elige otra para las mismas publicaciones">Agregar también a otra…</button>}
            {hayAlgo && <button onClick={() => onHecho(resumen())} disabled={enviando} className="btn-secondary text-sm">Terminar</button>}
            <button onClick={confirmar} disabled={!camp || sinEmpezar || !validas.length || enviando} className="btn-primary text-sm">
              {enviando ? (avance && avance.total > TANDA ? `Agregando… ${avance.hechas} de ${avance.total}` : 'Agregando y comprobando…') : `Agregar ${validas.length} a la campaña`}
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
  const [f, setF] = useState({ conexionIds: [conexionInicial ?? cuentas[0]?.id].filter(Boolean) as number[], nombre: '', pct: 0, desde: hoyMas(0), hasta: hoyMas(7) })
  const maxHasta = sumarDias(f.desde, MAX_DIAS_CAMPANA - 1)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const crear = async () => {
    setEnviando(true); setError(null)
    const r = await fetch('/api/promociones/campanas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) })
    const d = await r.json().catch(() => ({}))
    setEnviando(false)
    if (!r.ok) { setError(d.error ?? 'MercadoLibre no creó la campaña. Prueba de nuevo en un momento.'); return }
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
        <label className="block space-y-1"><span className="text-xs text-neutral-500">Descuento que vas a ofrecer (se propone solo al agregar publicaciones; lo puedes cambiar en cada una)</span>
          <span className="flex items-center gap-1">
            <input type="number" min={1} max={80} value={f.pct || ''} placeholder="15" onChange={e => setF({ ...f, pct: Math.max(0, Math.min(80, Number(e.target.value) || 0)) })}
              className="w-20 border border-neutral-300 rounded-lg px-2 py-1.5 text-right" />%
          </span>
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
          <button onClick={crear} disabled={enviando || f.nombre.trim().length < 3 || !f.pct || !f.conexionIds.length || f.hasta > maxHasta} className="btn-primary text-sm">
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
  const [f, setF] = useState({ nombre: campana.nombre, pct: campana.pctDefecto ?? 0, desde: diaVE(campana.inicio), hasta: diaVE(campana.fin) })
  const minDesde = hoyMas(0)
  const maxHasta = sumarDias(f.desde, MAX_DIAS_CAMPANA - 1)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const guardar = async () => {
    setEnviando(true); setError(null)
    const r = await fetch('/api/promociones/campanas', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conexionId: campana.conexionId, id: campana.id, nombre: f.nombre, pct: f.pct || null, desde: empezada ? null : f.desde, hasta: f.hasta }),
    })
    const d = await r.json().catch(() => ({}))
    setEnviando(false)
    if (!r.ok) { setError(d.error ?? 'MercadoLibre no guardó los cambios de la campaña. Prueba de nuevo en un momento.'); return }
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
        <label className="block space-y-1"><span className="text-xs text-neutral-500">Descuento por defecto (el que se propone al agregar; para cambiar las que ya están, usa «Cambiar %»)</span>
          <span className="flex items-center gap-1">
            <input type="number" min={1} max={80} value={f.pct || ''} placeholder="15" onChange={e => setF({ ...f, pct: Math.max(0, Math.min(80, Number(e.target.value) || 0)) })}
              className="w-20 border border-neutral-300 rounded-lg px-2 py-1.5 text-right" />%
          </span>
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
