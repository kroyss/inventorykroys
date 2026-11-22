'use client'
// Publicaciones → «Precio vs sistema» (22-11, pedido del dueño; API /api/precio-vs-ml, lib/precioVsML.ts).
// El precio de lista de cada publicación en ML contra el «Precio con exceso ML» del sistema (USD, sin descuento: el
// descuento lo pone la promoción). Se eligen las que están mal y se les pone el precio del sistema por la cola.
// Las que están en promoción: primero se sacan de TODAS sus promociones y después se cambia el precio; quedan en
// «Por restaurar» hasta volver a meterlas desde Promociones (los descuentos y precios cambian).
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from '@/components/ui/Link'
import { EncabezadoInfo } from '@/components/ui/Info'
import { Ventana } from '@/components/ui/Ventana'
import { vistoNuevo } from '@/components/ui/Nuevo'
import { AbrirFicha } from '@/components/preguntas/FichaPublicacion'
import type { PrecioVsMLRespuesta } from '@/app/api/precio-vs-ml/route'
import type { EstadoPrecio, FilaPrecioML, MotivoSinDato } from '@/lib/precioVsML'

const usd = (n: number | null | undefined) => n == null ? '—'
  : `$${n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const pctTxt = (n: number | null) => n == null ? '' : `${n > 0 ? '+' : ''}${n.toLocaleString('de-DE', { maximumFractionDigits: 1 })} %`

const TARJETAS: { k: EstadoPrecio; titulo: string; que: string; punto: string; numero: string; marco: string }[] = [
  { k: 'barato', titulo: 'Más barato en ML', que: 'Vendes por debajo del precio del sistema', punto: 'bg-red-500', numero: 'text-red-700', marco: 'border-red-300 ring-1 ring-red-200' },
  { k: 'caro', titulo: 'Más caro en ML', que: 'Por encima del precio del sistema', punto: 'bg-amber-500', numero: 'text-amber-700', marco: 'border-amber-300 ring-1 ring-amber-200' },
  { k: 'bien', titulo: 'Bien', que: 'Diferencia de 1 % o menos', punto: 'bg-emerald-500', numero: 'text-emerald-700', marco: 'border-emerald-300 ring-1 ring-emerald-200' },
  { k: 'sin_dato', titulo: 'Sin comparar', que: 'Falta un dato (cada fila dice cuál)', punto: 'bg-neutral-400', numero: 'text-neutral-700', marco: 'border-neutral-400 ring-1 ring-neutral-200' },
]
const MOTIVO: Record<MotivoSinDato, string> = {
  sin_costo: 'El producto no tiene costo o categoría: no hay precio del sistema',
  precios_distintos: 'Sus variantes son productos con precios distintos y en ML la publicación tiene un solo precio',
  otra_moneda: 'Publicada en otra moneda (no USD)',
  sin_precio_ml: 'Sin precio en ML (vuelve a leer de ML)',
}
type Orden = 'pct' | 'monto' | 'nombre'
type EstadoPub = 'activas' | 'pausadas' | 'todas'
/** Activas = active en ML; pausadas = todo lo demás (paused, closed, under_review…). */
const deEstado = (f: FilaPrecioML, e: EstadoPub) => e === 'todas' || (e === 'activas') === (f.estado_ml === 'active')
const POR_PAGINA = 50
/** Se elige sola con «Elegir las de este filtro»: lo que no tiene riesgo (sin promo, sin combo, sin «No sincronizar»). */
const segura = (f: FilaPrecioML) => (f.estado === 'barato' || f.estado === 'caro') && !f.promos.length && !f.combo && !f.aparte
const elegible = (f: FilaPrecioML) => f.estado === 'barato' || f.estado === 'caro'

export default function PrecioMLClient({ inicial, buscarInicial = '' }: { inicial: PrecioVsMLRespuesta | null; buscarInicial?: string }) {
  const [datos, setDatos] = useState<PrecioVsMLRespuesta | null>(inicial)
  const [cargando, setCargando] = useState(!inicial)
  const [error, setError] = useState<string | null>(null)
  // 22-11 (el dueño): por defecto solo las publicaciones activas; pausadas o todas, si las elige.
  const [estadoPub, setEstadoPub] = useState<EstadoPub>('activas')
  const [filtro, setFiltro] = useState<EstadoPrecio>(() => primerFiltro((inicial?.filas ?? []).filter(f => deEstado(f, 'activas'))))
  const [buscar, setBuscar] = useState(buscarInicial)
  const [cuenta, setCuenta] = useState('')
  const [promo, setPromo] = useState<'todas' | 'sin' | 'con'>('todas')
  const [orden, setOrden] = useState<Orden>('pct')
  const [pagina, setPagina] = useState(0)
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set())
  const [confirmar, setConfirmar] = useState(false)
  const [releyendo, setReleyendo] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)

  useEffect(() => { vistoNuevo('precio_vs_ml') }, [])

  const cargar = useCallback(async () => {
    setCargando(true); setError(null)
    try {
      const r = await fetch('/api/precio-vs-ml')
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? 'No se pudo cargar')
      setDatos(d)
      return d as PrecioVsMLRespuesta
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo cargar'); return null }
    finally { setCargando(false) }
  }, [])
  useEffect(() => { if (!inicial) cargar().then(d => d && setFiltro(primerFiltro(d.filas.filter(f => deEstado(f, 'activas'))))) }, [inicial, cargar])
  // 22-11 (el dueño: «al terminar no me los quitó de la lista»): mientras haya un cambio de precios en la cola, la lista
  // se vuelve a pedir cada 6 s (sin «Cargando…»); al terminar la cola, la última recarga ya trae los precios nuevos y las
  // corregidas pasan a «Bien» solas.
  const enCola = datos?.cola?.id ?? null
  useEffect(() => {
    if (enCola == null) return
    const t = setInterval(() => { if (!document.hidden) cargar() }, 6000)
    return () => clearInterval(t)
  }, [enCola, cargar])

  const filas = useMemo(() => datos?.filas ?? [], [datos])
  const cuentas = useMemo(() => [...new Set(filas.map(f => f.cuenta))].sort(), [filas])
  const conteo = useMemo(() => {
    const c: Record<EstadoPrecio, number> = { bien: 0, barato: 0, caro: 0, sin_dato: 0 }
    for (const f of filas) if ((!cuenta || f.cuenta === cuenta) && deEstado(f, estadoPub)) c[f.estado]++
    return c
  }, [filas, cuenta, estadoPub])

  const vista = useMemo(() => {
    const q = buscar.trim().toLowerCase()
    const l = filas.filter(f => f.estado === filtro && (!cuenta || f.cuenta === cuenta) && deEstado(f, estadoPub)
      && (promo === 'todas' || (promo === 'con') === f.promos.length > 0)
      && (!q || f.item_id.toLowerCase().includes(q) || (f.titulo ?? '').toLowerCase().includes(q)
          || f.productos.some(p => p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q))))
    return l.sort((a, b) => orden === 'nombre' ? (a.titulo ?? '').localeCompare(b.titulo ?? '')
      : orden === 'monto' ? Math.abs(b.diferencia ?? 0) - Math.abs(a.diferencia ?? 0)
      : Math.abs(b.pct ?? 0) - Math.abs(a.pct ?? 0))
  }, [filas, filtro, cuenta, estadoPub, promo, buscar, orden])
  useEffect(() => { setPagina(0) }, [filtro, cuenta, estadoPub, promo, buscar, orden])

  const pag = vista.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA)
  const paginas = Math.ceil(vista.length / POR_PAGINA)
  const elegidas = useMemo(() => filas.filter(f => marcadas.has(f.item_id) && elegible(f)), [filas, marcadas])
  const segurasFiltro = vista.filter(segura)
  const marcar = (id: string, v: boolean) => setMarcadas(s => { const n = new Set(s); if (v) n.add(id); else n.delete(id); return n })

  async function releer() {
    setReleyendo(true); setError(null)
    try {
      const r = await fetch('/api/precio-vs-ml', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion: 'actualizar' }) })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? 'No se pudo leer de MercadoLibre')
      await cargar()
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo leer de MercadoLibre') }
    finally { setReleyendo(false) }
  }

  async function restaurada(lote_id: number, item_id: string) {
    const r = await fetch('/api/precio-vs-ml', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion: 'restaurada', lote_id, item_id }) })
    if (r.ok) setDatos(d => d && { ...d, restaurar: d.restaurar.filter(x => !(x.lote_id === lote_id && x.item_id === item_id)) })
  }

  const restaurar = datos?.restaurar ?? []

  return (
    <div className="space-y-4">
      <EncabezadoInfo title="Precio vs sistema" subtitle="El precio de cada publicación en MercadoLibre contra el precio con exceso del sistema"
        actions={<button onClick={releer} disabled={releyendo} className="btn-secondary text-sm disabled:opacity-50">
          {releyendo ? 'Leyendo de ML…' : 'Volver a leer de ML'}</button>}
        info={<>
          <li><b className="font-medium text-neutral-800">Precio en ML</b>: el precio de lista de la publicación, en dólares, sin la promoción.</li>
          <li><b className="font-medium text-neutral-800">Precio sistema</b>: el «Precio con exceso ML» del producto calculado hoy (costo × recargo × exceso), sin descuento. El descuento lo pones con las promociones.</li>
          <li><b className="font-medium text-neutral-800">Bien</b>: la diferencia es de 1 % o menos (por decimales). <b className="font-medium text-neutral-800">Combo</b> («trae N u.»): el precio del sistema es N × el del producto.</li>
          <li>Elige las que quieras corregir y toca <b className="font-medium text-neutral-800">Poner precio del sistema</b>: antes de mandar ves el antes → después. Va por la cola (el avance sale abajo a la derecha) y la lista se actualiza sola: las que quedan bien salen de aquí.</li>
          <li><b className="font-medium text-neutral-800">En promo</b>: para cambiarle el precio primero se saca de TODAS sus promociones. Después quedan en <b className="font-medium text-neutral-800">Por restaurar</b> y las vuelves a meter desde Promociones (los descuentos y precios cambian).</li>
          <li>Arriba se ven solo las publicaciones <b className="font-medium text-neutral-800">activas</b>; para ver las pausadas (o las dos), cámbialo en el filtro de estado.</li>
          <li>Con «Elegir las de este filtro» no se eligen las que están en promo, los combos ni las de «No sincronizar»: esas se eligen a mano.</li>
        </>} />

      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {aviso && <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
        <span>{aviso}</span>
        <button onClick={() => { setAviso(null); cargar() }} className="text-sm font-medium underline underline-offset-2">Volver a cargar</button>
      </div>}

      {restaurar.length > 0 && (
        <section className="rounded-xl border border-amber-300 bg-amber-50 p-3">
          <p className="text-sm font-semibold text-amber-900">Por restaurar: {restaurar.length} publicaci{restaurar.length === 1 ? 'ón perdió sus' : 'ones perdieron sus'} promociones al cambiar el precio</p>
          <p className="mt-0.5 text-xs text-amber-800">Vuelve a meterlas desde Promociones (revisa el descuento: el precio cambió). Salen de aquí solas al volver a la campaña, o con «Ya la revisé».</p>
          <ul className="mt-2 divide-y divide-amber-200">
            {restaurar.slice(0, 30).map(x => (
              <li key={`${x.lote_id}:${x.item_id}`} className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 text-sm">
                  <p className="truncate font-medium text-neutral-900">{x.titulo ?? x.item_id}</p>
                  <p className="text-xs text-neutral-600">{x.cuenta ?? ''} · {x.item_id} · {usd(x.precio_antes)} → {usd(x.precio_nuevo)} · tenía: {x.promos.map(p => p.nombre ?? p.id).join(', ')}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  {datos?.conPromociones && <Link href={`/productos/promociones?buscar=${encodeURIComponent(x.item_id)}`} className="btn-primary text-xs">Abrir en Promociones</Link>}
                  <button onClick={() => restaurada(x.lote_id, x.item_id)} className="btn-secondary text-xs">Ya la revisé</button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {TARJETAS.map(t => (
          <button key={t.k} onClick={() => setFiltro(t.k)} aria-pressed={filtro === t.k}
            className={`rounded-xl border bg-white p-3 text-left transition ${filtro === t.k ? t.marco : 'border-neutral-200 hover:border-neutral-300'}`}>
            <span className="flex items-center gap-1.5 text-xs font-medium text-neutral-600"><span className={`h-2 w-2 rounded-full ${t.punto}`} />{t.titulo}</span>
            <span className={`mt-1 block text-2xl font-bold ${conteo[t.k] ? t.numero : 'text-neutral-300'}`}>{cargando && !datos ? '…' : conteo[t.k]}</span>
            <span className="hidden text-[11px] text-neutral-500 sm:block">{t.que}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar título, MLV o código"
          className="w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm sm:w-64" />
        <select value={cuenta} onChange={e => setCuenta(e.target.value)} className="rounded-lg border border-neutral-300 px-2 py-1.5 text-sm" aria-label="Cuenta">
          <option value="">Todas las cuentas</option>
          {cuentas.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={estadoPub} onChange={e => setEstadoPub(e.target.value as EstadoPub)} className="rounded-lg border border-neutral-300 px-2 py-1.5 text-sm" aria-label="Estado de la publicación">
          <option value="activas">Activas</option>
          <option value="pausadas">Pausadas</option>
          <option value="todas">Activas y pausadas</option>
        </select>
        <select value={promo} onChange={e => setPromo(e.target.value as typeof promo)} className="rounded-lg border border-neutral-300 px-2 py-1.5 text-sm" aria-label="Promociones">
          <option value="todas">Con y sin promo</option>
          <option value="sin">Sin promo</option>
          <option value="con">En promo</option>
        </select>
        <select value={orden} onChange={e => setOrden(e.target.value as Orden)} className="rounded-lg border border-neutral-300 px-2 py-1.5 text-sm" aria-label="Ordenar">
          <option value="pct">Mayor diferencia (%)</option>
          <option value="monto">Mayor diferencia ($)</option>
          <option value="nombre">Nombre</option>
        </select>
        <span className="text-xs text-neutral-500">{vista.length} publicaci{vista.length === 1 ? 'ón' : 'ones'}</span>
      </div>

      {(filtro === 'barato' || filtro === 'caro') && vista.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2">
          <button onClick={() => setMarcadas(s => new Set([...s, ...segurasFiltro.map(f => f.item_id)]))} disabled={!segurasFiltro.length}
            className="btn-secondary text-xs disabled:opacity-50">Elegir las {segurasFiltro.length} de este filtro</button>
          {marcadas.size > 0 && <button onClick={() => setMarcadas(new Set())} className="text-xs text-neutral-600 underline underline-offset-2">Quitar selección</button>}
          <span className="text-xs text-neutral-500">{segurasFiltro.length < vista.length ? 'Las que están en promo, los combos y las de «No sincronizar» se eligen a mano.' : ''}</span>
          <button onClick={() => setConfirmar(true)} disabled={!elegidas.length || !!datos?.cola}
            className="btn-primary ml-auto text-sm disabled:opacity-50">
            Poner precio del sistema{elegidas.length ? ` (${elegidas.length})` : ''}</button>
        </div>
      )}
      {datos?.cola && <p className="text-xs text-neutral-500">Hay un cambio de precios en curso ({datos.cola.total}): el avance sale abajo a la derecha. La lista se actualiza sola: las que vayan quedando bien salen de aquí.</p>}

      {cargando && !datos ? <p className="py-10 text-center text-sm text-neutral-500">Cargando…</p>
        : !vista.length ? <p className="rounded-xl border border-dashed border-neutral-300 py-10 text-center text-sm text-neutral-500">
            {filas.length ? 'Nada en este grupo con estos filtros ✓' : 'No hay publicaciones vinculadas a productos. Vincúlalas en Mis publicaciones → Vincular.'}</p>
        : <>
          {/* Escritorio: tabla */}
          <div className="hidden overflow-hidden rounded-xl border border-neutral-200 bg-white md:block">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-left text-xs text-neutral-500">
                <tr>
                  <th className="w-8 px-3 py-2" />
                  <th className="px-3 py-2">Publicación</th>
                  <th className="px-3 py-2">Producto</th>
                  <th className="px-3 py-2 text-right">Precio en ML</th>
                  <th className="px-3 py-2 text-right">Precio sistema</th>
                  <th className="px-3 py-2 text-right">Diferencia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {pag.map(f => (
                  <tr key={f.item_id} className={marcadas.has(f.item_id) ? 'bg-lime-50/60' : ''}>
                    <td className="px-3 py-2 align-top">
                      {elegible(f) && <input type="checkbox" checked={marcadas.has(f.item_id)} onChange={e => marcar(f.item_id, e.target.checked)}
                        aria-label={`Elegir ${f.titulo ?? f.item_id}`} className="mt-1" />}
                    </td>
                    <td className="max-w-md px-3 py-2 align-top"><Publicacion f={f} /></td>
                    <td className="px-3 py-2 align-top"><Productos f={f} /></td>
                    <td className="whitespace-nowrap px-3 py-2 text-right align-top">
                      <span className="font-medium">{usd(f.precio_ml)}</span>
                      {precioPromo(f) != null && <span className="block text-[11px] text-violet-700">en promo {usd(precioPromo(f))}</span>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right align-top font-medium">{usd(f.precio_sistema)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right align-top"><Diferencia f={f} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Celular: tarjetas */}
          <ul className="space-y-2 md:hidden">
            {pag.map(f => (
              <li key={f.item_id} className={`rounded-xl border bg-white p-3 ${marcadas.has(f.item_id) ? 'border-lime-400' : 'border-neutral-200'}`}>
                <div className="flex gap-2">
                  {elegible(f) && <input type="checkbox" checked={marcadas.has(f.item_id)} onChange={e => marcar(f.item_id, e.target.checked)}
                    aria-label={`Elegir ${f.titulo ?? f.item_id}`} className="mt-1 shrink-0" />}
                  <div className="min-w-0 flex-1"><Publicacion f={f} /></div>
                </div>
                <div className="mt-2"><Productos f={f} /></div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-lg bg-neutral-50 p-1.5"><span className="block text-neutral-500">En ML</span><span className="font-semibold">{usd(f.precio_ml)}</span></div>
                  <div className="rounded-lg bg-neutral-50 p-1.5"><span className="block text-neutral-500">Sistema</span><span className="font-semibold">{usd(f.precio_sistema)}</span></div>
                  <div className="rounded-lg bg-neutral-50 p-1.5"><span className="block text-neutral-500">Diferencia</span><Diferencia f={f} /></div>
                </div>
              </li>
            ))}
          </ul>
          {paginas > 1 && (
            <div className="flex items-center justify-center gap-3 text-sm">
              <button onClick={() => setPagina(p => Math.max(0, p - 1))} disabled={pagina === 0} className="btn-secondary text-xs disabled:opacity-40">← Anterior</button>
              <span className="text-neutral-500">{pagina + 1} de {paginas}</span>
              <button onClick={() => setPagina(p => Math.min(paginas - 1, p + 1))} disabled={pagina >= paginas - 1} className="btn-secondary text-xs disabled:opacity-40">Siguiente →</button>
            </div>
          )}
        </>}

      {confirmar && <Confirmar elegidas={elegidas} onCerrar={() => setConfirmar(false)}
        onHecho={(msg) => { setConfirmar(false); setMarcadas(new Set()); setAviso(msg); cargar() }} />}
    </div>
  )
}

/** El precio que paga hoy el comprador si está en promoción (el menor de sus promociones). */
function precioPromo(f: FilaPrecioML): number | null {
  const l = f.promos.map(p => p.precio).filter((n): n is number => n != null && n > 0)
  return l.length ? Math.min(...l) : null
}

function primerFiltro(filas: FilaPrecioML[]): EstadoPrecio {
  return (['barato', 'caro', 'bien', 'sin_dato'] as const).find(k => filas.some(f => f.estado === k)) ?? 'barato'
}

function Publicacion({ f }: { f: FilaPrecioML }) {
  return (
    <div className="flex min-w-0 gap-2">
      {f.foto ? <img src={f.foto} alt="" className="h-10 w-10 shrink-0 rounded-md border border-neutral-200 object-cover" loading="lazy" />
        : <span className="h-10 w-10 shrink-0 rounded-md border border-neutral-200 bg-neutral-50" />}
      <div className="min-w-0">
        <AbrirFicha item={f.item_id} className="block max-w-full truncate font-medium text-neutral-900 hover:underline">{f.titulo ?? f.item_id}</AbrirFicha>
        <p className="text-xs text-neutral-500">{f.cuenta} · {f.item_id}{f.estado_ml === 'paused' ? ' · Pausada' : ''}</p>
        <div className="mt-0.5 flex flex-wrap gap-1">
          {f.promos.length > 0 && <span title={f.promos.map(p => `${p.nombre ?? p.id}${p.precio != null ? `: ${usd(p.precio)}` : ''}`).join('\n')}
            className="rounded bg-violet-50 px-1.5 text-[11px] font-medium text-violet-700 ring-1 ring-violet-200">En promo ({f.promos.length})</span>}
          {f.combo && <span className="rounded bg-sky-50 px-1.5 text-[11px] font-medium text-sky-700 ring-1 ring-sky-200">Combo</span>}
          {f.aparte && <span className="rounded bg-neutral-100 px-1.5 text-[11px] font-medium text-neutral-600 ring-1 ring-neutral-200" title="Marcada «No sincronizar» (rifa, encargo…)">No sincronizar</span>}
        </div>
        {f.motivo && <p className="mt-0.5 text-xs text-neutral-500">{MOTIVO[f.motivo]}</p>}
      </div>
    </div>
  )
}

function Productos({ f }: { f: FilaPrecioML }) {
  return (
    <ul className="space-y-0.5 text-xs">
      {f.productos.slice(0, 4).map(p => (
        <li key={`${p.product_id}:${p.variante ?? ''}`} className="text-neutral-700">
          <span className="font-mono text-[11px] text-neutral-500">{p.code}</span> {p.name}
          {p.variante && <span className="text-neutral-400"> · {p.variante}</span>}
          {p.unidades > 1 && <span className="text-sky-700"> · trae {p.unidades} u.</span>}
          {f.productos.length > 1 && <span className="text-neutral-500"> · {usd(p.precio)}</span>}
        </li>
      ))}
      {f.productos.length > 4 && <li className="text-neutral-400">y {f.productos.length - 4} más</li>}
    </ul>
  )
}

function Diferencia({ f }: { f: FilaPrecioML }) {
  if (f.diferencia == null) return <span className="text-neutral-400">—</span>
  const c = f.estado === 'barato' ? 'text-red-700' : f.estado === 'caro' ? 'text-amber-700' : 'text-emerald-700'
  return <span className={`font-semibold ${c}`}>{f.diferencia > 0 ? '+' : ''}{usd(f.diferencia).replace('$-', '-$')}<span className="block text-[11px] font-normal">{pctTxt(f.pct)}</span></span>
}

function Confirmar({ elegidas, onCerrar, onHecho }: { elegidas: FilaPrecioML[]; onCerrar: () => void; onHecho: (msg: string) => void }) {
  const conPromo = elegidas.filter(f => f.promos.length)
  const [entiendo, setEntiendo] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function mandar() {
    setEnviando(true); setError(null)
    try {
      const r = await fetch('/api/precio-vs-ml', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'poner', items: elegidas.map(f => f.item_id), con_promos: conPromo.length > 0 && entiendo }) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? 'No se pudo')
      try { window.dispatchEvent(new Event('cola-ml')) } catch { /* sin ventana */ }
      const salt = (d.saltadas ?? []).length
      onHecho(`Va por la cola: ${d.lote.total} publicaci${d.lote.total === 1 ? 'ón' : 'ones'}${salt ? ` (${salt} no, porque cambiaron)` : ''}. El avance sale abajo a la derecha.`)
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo') }
    finally { setEnviando(false) }
  }
  return (
    <Ventana titulo={`Poner precio del sistema en ${elegidas.length} publicaci${elegidas.length === 1 ? 'ón' : 'ones'}`} onCerrar={onCerrar}>
      <div className="space-y-3">
        {conPromo.length > 0 && (
          <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">
            <p className="font-semibold">{conPromo.length} {conPromo.length === 1 ? 'está' : 'están'} en promoción y {conPromo.length === 1 ? 'perderá' : 'perderán'} TODAS sus promociones</p>
            <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-xs">
              <li>Primero se sacan de sus promociones.</li>
              <li>Después se cambia el precio.</li>
              <li>Al final tienes que volver a meterlas desde Promociones: los descuentos y precios cambian. Quedan en «Por restaurar» con las promociones que tenían.</li>
            </ol>
            <label className="mt-2 flex items-start gap-2 text-xs font-medium">
              <input type="checkbox" checked={entiendo} onChange={e => setEntiendo(e.target.checked)} className="mt-0.5" />
              Entiendo: pierden sus promociones y después las restauro en Promociones
            </label>
          </div>
        )}
        <div className="max-h-72 overflow-y-auto rounded-lg border border-neutral-200">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-neutral-50 text-left text-neutral-500">
              <tr><th className="px-2 py-1.5">Publicación</th><th className="px-2 py-1.5 text-right">Antes</th><th className="px-2 py-1.5 text-right">Después</th></tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {elegidas.map(f => (
                <tr key={f.item_id}>
                  <td className="max-w-[14rem] truncate px-2 py-1.5">{f.titulo ?? f.item_id}<span className="block text-[11px] text-neutral-400">{f.cuenta}{f.promos.length ? ' · sale de sus promociones' : ''}</span></td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-right text-neutral-500">{usd(f.precio_ml)}</td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-right font-semibold">{usd(f.precio_sistema)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-neutral-500">Precios en dólares, como en MercadoLibre. El servidor vuelve a calcular el precio del sistema al mandar. Va por la cola: no hace falta dejar la pantalla abierta.</p>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onCerrar} className="btn-secondary text-sm">Cancelar</button>
          <button onClick={mandar} disabled={enviando || (conPromo.length > 0 && !entiendo)} className="btn-primary text-sm disabled:opacity-50">
            {enviando ? 'Mandando…' : 'Mandar a MercadoLibre'}</button>
        </div>
      </div>
    </Ventana>
  )
}
