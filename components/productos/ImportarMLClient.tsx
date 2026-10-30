'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Cargando, EmptyState, FilterPills, KPICard, PageHeader } from '@/components/ui'
import { Combobox, type ComboOption } from '@/components/ui/Combobox'
import { matchTokens } from '@/lib/search'
import type { EstadoImportar, FilaImportar } from '@/lib/importarML'

// Productos → Importar desde MercadoLibre (lib/importarML.ts). Primeros pasos: las publicaciones
// (o cada variante) se vinculan a un producto existente o se crean como productos nuevos.

type Filtro = 'revisar' | 'parecida' | 'nueva' | 'vinculada'
interface Datos { filas: FilaImportar[]; actualizado_at: string | null; cuentas: number; pais: 'VE' | 'CO' }
interface Borrador { costo: string; stock: string }

const POR_PAGINA = 60
const num = (s: string) => { const n = Number(s.replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) ? n : NaN }
const fecha = (s: string | null) => s ? new Date(s).toLocaleString('es-VE', { day: '2-digit', month: '2-digit', hour: 'numeric', minute: '2-digit' }) : '—'
function precioTxt(p: number | null, moneda: string | null) {
  if (p == null) return null
  const n = p.toLocaleString('de-DE', { minimumFractionDigits: moneda === 'COP' ? 0 : 2, maximumFractionDigits: moneda === 'COP' ? 0 : 2 })
  return moneda === 'VES' ? `Bs ${n}` : `$${n}`
}

function Foto({ src }: { src: string | null }) {
  return src
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={src} alt="" loading="lazy" className="h-11 w-11 shrink-0 rounded-lg border border-neutral-200 bg-white object-contain" />
    : (
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-neutral-200 bg-neutral-50 text-neutral-300">
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" />
        </svg>
      </div>
    )
}

function Etiqueta({ f }: { f: FilaImportar }) {
  if (f.estado === 'vinculada') return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
      <span className="truncate">Vinculada a {f.producto?.code}{f.producto?.toda ? ' (toda la publicación)' : ''}</span>
    </span>
  )
  if (f.estado === 'parecida') return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800"
      title={`${f.producto?.code} · ${f.producto?.name}`}>
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
      <span className="truncate">Se parece a {f.producto?.code} · {f.producto?.name}</span>
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700">
      <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />Nueva
    </span>
  )
}

export default function ImportarMLClient({ conCuentas }: { conCuentas: boolean }) {
  const [datos, setDatos] = useState<Datos | null>(null)
  const [productos, setProductos] = useState<ComboOption[]>([])
  const [filtro, setFiltro] = useState<Filtro>('revisar')
  const [cuenta, setCuenta] = useState('')
  const [buscar, setBuscar] = useState('')
  const [pagina, setPagina] = useState(1)
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set())
  const [borrador, setBorrador] = useState<Record<string, Borrador>>({})
  const [esNueva, setEsNueva] = useState<Set<string>>(new Set())        // "Es nueva" en una parecida
  const [eligiendo, setEligiendo] = useState<string | null>(null)       // "Otro…": combobox abierto
  const [eleccion, setEleccion] = useState('')
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null)

  const cargar = useCallback(async () => {
    const r = await fetch('/api/products/importar-ml', { cache: 'no-store' })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setAviso({ ok: false, texto: d.error ?? 'No se pudo cargar' }); return }
    setDatos(d)
  }, [])
  const cargarProductos = useCallback(async () => {
    const r = await fetch('/api/products', { cache: 'no-store' })
    if (!r.ok) return
    const lista = await r.json() as { id: number; code: string; name: string; is_active: boolean }[]
    setProductos(lista.filter(p => p.is_active).map(p => ({ id: p.id, name: `${p.code} · ${p.name}` })))
  }, [])
  useEffect(() => { if (conCuentas) { cargar(); cargarProductos() } }, [conCuentas, cargar, cargarProductos])

  const estadoDe = useCallback((f: FilaImportar): EstadoImportar =>
    f.estado === 'parecida' && esNueva.has(f.codigo) ? 'nueva' : f.estado, [esNueva])

  const filas = useMemo(() => datos?.filas ?? [], [datos])
  const cuentas = useMemo(() => [...new Set(filas.map(f => f.cuenta))], [filas])
  const deCuenta = useMemo(() => filas.filter(f => !cuenta || f.cuenta === cuenta), [filas, cuenta])
  const conteo = useMemo(() => {
    const c = { vinculada: 0, parecida: 0, nueva: 0 }
    for (const f of deCuenta) c[estadoDe(f)]++
    return c
  }, [deCuenta, estadoDe])
  const visibles = useMemo(() => deCuenta.filter(f => {
    const e = estadoDe(f)
    if (filtro === 'revisar' ? e === 'vinculada' : e !== filtro) return false
    return matchTokens(buscar, f.titulo, f.variante, f.item_id, f.producto?.code)
  }), [deCuenta, estadoDe, filtro, buscar])
  const pagina1 = visibles.slice(0, pagina * POR_PAGINA)

  const paraPrecio = (f: FilaImportar) =>
    (datos?.pais === 'VE' && f.moneda === 'USD') || (datos?.pais === 'CO' && f.moneda === 'COP') ? f.precio : null
  const bor = (f: FilaImportar): Borrador => borrador[f.codigo] ?? { costo: '', stock: String(Math.max(0, f.disponible)) }
  const editar = (f: FilaImportar, campo: keyof Borrador, v: string) =>
    setBorrador(b => ({ ...b, [f.codigo]: { ...bor(f), [campo]: v } }))
  const marcar = (codigo: string, on: boolean) => setMarcadas(m => {
    const s = new Set(m)
    if (on) s.add(codigo); else s.delete(codigo)
    return s
  })

  const nuevasVisibles = visibles.filter(f => estadoDe(f) === 'nueva')
  const todasMarcadas = nuevasVisibles.length > 0 && nuevasVisibles.every(f => marcadas.has(f.codigo))
  const aCrear = filas.filter(f => marcadas.has(f.codigo) && estadoDe(f) === 'nueva')
  const invalidas = aCrear.filter(f => {
    const b = bor(f)
    return (b.costo.trim() !== '' && !(num(b.costo) >= 0)) || !(Number.isInteger(num(b.stock)) && num(b.stock) >= 0)
  })
  const sinCosto = aCrear.filter(f => bor(f).costo.trim() === '').length

  const post = async (body: unknown) => {
    const r = await fetch('/api/products/importar-ml', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    const d = await r.json().catch(() => ({}))
    return { ok: r.ok && d.ok !== false, d }
  }

  const actualizar = async () => {
    setOcupado('actualizar'); setAviso(null)
    const { ok, d } = await post({ accion: 'actualizar' })
    setAviso(ok ? { ok: true, texto: 'Lista actualizada con lo que hay ahora en MercadoLibre.' }
      : { ok: false, texto: d.errores?.join(' · ') || d.error || 'No se pudo traer de MercadoLibre' })
    await cargar(); setOcupado(null)
  }

  const vincular = async (f: FilaImportar, productId: number, code: string) => {
    setOcupado(f.codigo); setAviso(null)
    const { ok, d } = await post({ accion: 'vincular', codigo: f.codigo, cuenta: f.cuenta, product_id: productId })
    setOcupado(null)
    if (!ok) { setAviso({ ok: false, texto: d.error ?? 'No se pudo vincular' }); return }
    setEligiendo(null); setEleccion('')
    setAviso({ ok: true, texto: `${f.titulo}${f.variante ? ` (${f.variante})` : ''} quedó vinculada a ${code}.` })
    // Al instante en pantalla (la lista completa tarda en rehacerse).
    setDatos(d => d && { ...d, filas: d.filas.map(x => x.codigo === f.codigo
      ? { ...x, estado: 'vinculada', producto: { id: productId, code, name: x.producto?.id === productId ? x.producto.name : '', toda: false } } : x) })
  }

  const crear = async () => {
    if (!aCrear.length || invalidas.length) return
    setOcupado('crear'); setAviso(null)
    const { ok, d } = await post({
      accion: 'crear',
      productos: aCrear.slice(0, 200).map(f => {
        const b = bor(f)
        return {
          codigo: f.codigo, cuenta: f.cuenta, nombre: f.variante ? `${f.titulo} · ${f.variante}` : f.titulo,
          costo: b.costo.trim() === '' ? null : num(b.costo), stock: num(b.stock), precio: paraPrecio(f),
        }
      }),
    })
    setOcupado(null)
    if (!ok) { setAviso({ ok: false, texto: d.error ?? 'No se pudieron crear' }); return }
    const n = (d.creados as string[]).length
    setAviso({ ok: true, texto: n
      ? `${n} ${n === 1 ? 'producto creado' : 'productos creados'} (${d.creados[0]}${n > 1 ? ` a ${d.creados[n - 1]}` : ''}). Su stock quedó marcado "por verificar".`
      : 'No se creó nada: esas publicaciones ya estaban vinculadas.' })
    setMarcadas(new Set())
    cargar(); cargarProductos()
  }

  if (!conCuentas) return (
    <div className="space-y-4">
      <PageHeader title="Importar desde MercadoLibre" />
      <div className="rounded-xl border border-neutral-200 bg-white shadow-sm">
        <EmptyState message="Conecta tus cuentas de MercadoLibre para traer tus publicaciones y convertirlas en productos."
          cta={<Link href="/cuentas-ml" className="btn-primary text-sm">Conectar cuentas</Link>} />
      </div>
    </div>
  )

  return (
    <div className="space-y-4 pb-20">
      <PageHeader title="Importar desde MercadoLibre"
        subtitle="Primeros pasos: tus publicaciones se convierten en productos. Vincula las que ya tienes y crea las que faltan."
        actions={<>
          <Link href="/productos" className="btn-secondary text-sm">Volver a Productos</Link>
          <button type="button" onClick={actualizar} disabled={!!ocupado} className="btn-secondary text-sm inline-flex items-center gap-1.5">
            <svg className={`h-3.5 w-3.5 ${ocupado === 'actualizar' ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 3v6h-6" />
            </svg>
            {ocupado === 'actualizar' ? 'Trayendo…' : 'Actualizar desde ML'}
          </button>
        </>} />

      <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-2.5 text-xs leading-relaxed text-amber-900">
        <svg className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>
        <p>
          El stock de los productos nuevos es el que <b>MercadoLibre</b> dice que hay, y suele no ser exacto: quedan marcados
          <b> “stock por verificar”</b> hasta que lo confirmes producto por producto en Inventario. El costo lo puedes dejar
          vacío y completarlo después. Publicaciones del catálogo al {fecha(datos?.actualizado_at ?? null)}
        </p>
      </div>

      {aviso && (
        <div className={`rounded-lg border px-3 py-2 text-sm ${aviso.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700'}`}>
          {aviso.texto}
        </div>
      )}

      {!datos ? <Cargando /> : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <KPICard label="Publicaciones" value={deCuenta.length} sub={deCuenta.length !== new Set(deCuenta.map(f => f.item_id)).size ? 'contando cada variante' : undefined} />
            <KPICard label="Ya vinculadas" value={conteo.vinculada} tone="bueno" active={filtro === 'vinculada'} onClick={() => { setFiltro('vinculada'); setPagina(1) }} />
            <KPICard label="Se parecen a uno tuyo" value={conteo.parecida} tone={conteo.parecida ? 'atencion' : 'apagado'} active={filtro === 'parecida'} onClick={() => { setFiltro('parecida'); setPagina(1) }} />
            <KPICard label="Nuevas" value={conteo.nueva} active={filtro === 'nueva'} onClick={() => { setFiltro('nueva'); setPagina(1) }} />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <FilterPills<Filtro> value={filtro} onChange={v => { setFiltro(v); setPagina(1) }} options={[
              { value: 'revisar', label: 'Por revisar', count: conteo.parecida + conteo.nueva },
              { value: 'parecida', label: 'Se parecen', count: conteo.parecida },
              { value: 'nueva', label: 'Nuevas', count: conteo.nueva },
              { value: 'vinculada', label: 'Vinculadas', count: conteo.vinculada },
            ]} />
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {cuentas.length > 1 && (
                <select value={cuenta} onChange={e => { setCuenta(e.target.value); setPagina(1) }}
                  className="rounded-lg border border-neutral-300 bg-white px-2 py-1.5 text-xs">
                  <option value="">Todas las cuentas</option>
                  {cuentas.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              )}
              <input value={buscar} onChange={e => { setBuscar(e.target.value); setPagina(1) }} placeholder="Buscar por título o código"
                className="w-56 rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-xs" />
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
            {(filtro === 'nueva' || filtro === 'revisar') && nuevasVisibles.length > 0 && (
              <label className="flex cursor-pointer items-center gap-2.5 border-b border-neutral-100 bg-neutral-50 px-4 py-2 text-xs text-neutral-600">
                <input type="checkbox" checked={todasMarcadas} className="h-4 w-4 accent-neutral-900"
                  onChange={e => setMarcadas(m => {
                    const s = new Set(m)
                    for (const f of nuevasVisibles) { if (e.target.checked) s.add(f.codigo); else s.delete(f.codigo) }
                    return s
                  })} />
                Marcar las {nuevasVisibles.length} nuevas{buscar || cuenta ? ' de esta búsqueda' : ''} para crearlas
              </label>
            )}
            {!visibles.length ? (
              <EmptyState message={filtro === 'vinculada' ? 'Todavía no hay publicaciones vinculadas a tus productos.'
                : filas.length ? 'Nada por revisar aquí: todas tus publicaciones ya tienen su producto.'
                : 'No hay publicaciones en el catálogo todavía. Toca “Actualizar desde ML” para traerlas.'} />
            ) : (
              <ul className="divide-y divide-neutral-100">
                {pagina1.map(f => {
                  const e = estadoDe(f)
                  const b = bor(f)
                  const marcada = marcadas.has(f.codigo)
                  const precio = precioTxt(f.precio, f.moneda)
                  return (
                    <li key={f.codigo} className={`px-4 py-3 ${marcada ? 'bg-sky-50/40' : ''}`}>
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          <span className="w-4 shrink-0">
                            {e === 'nueva' && (
                              <input type="checkbox" checked={marcada} onChange={ev => marcar(f.codigo, ev.target.checked)}
                                aria-label={`Crear ${f.titulo}`} className="h-4 w-4 accent-neutral-900" />
                            )}
                          </span>
                          <Foto src={f.thumbnail} />
                          <div className="min-w-0 flex-1">
                            <p className={`truncate text-sm ${e === 'vinculada' ? 'text-neutral-500' : 'text-neutral-900'}`} title={f.titulo}>{f.titulo}</p>
                            {f.variante && <p className="truncate text-xs font-medium text-violet-700">{f.variante}</p>}
                            <p className="mt-0.5 truncate text-[11px] text-neutral-400">
                              {f.permalink
                                ? <a href={f.permalink} target="_blank" rel="noreferrer" className="hover:text-neutral-600 hover:underline">{f.item_id}</a>
                                : f.item_id}
                              {' · '}{f.cuenta}{precio && <> · {precio}</>} · {f.disponible} disp.
                              {f.estado_ml === 'paused' && <span className="ml-1 rounded bg-neutral-100 px-1 text-neutral-500">pausada</span>}
                            </p>
                            <div className="mt-1"><Etiqueta f={{ ...f, estado: e }} /></div>
                          </div>
                        </div>

                        <div className="flex shrink-0 flex-wrap items-center gap-2 pl-7 lg:pl-0">
                          {e === 'parecida' && f.producto && eligiendo !== f.codigo && <>
                            <button type="button" disabled={ocupado === f.codigo} onClick={() => vincular(f, f.producto!.id, f.producto!.code)}
                              className="btn-primary text-xs" title={`Vincular a ${f.producto.code} · ${f.producto.name}`}>
                              {ocupado === f.codigo ? 'Vinculando…' : `Sí, es ${f.producto.code}`}
                            </button>
                            <button type="button" onClick={() => { setEligiendo(f.codigo); setEleccion('') }} className="btn-secondary text-xs">Otro…</button>
                            <button type="button" onClick={() => setEsNueva(s => new Set(s).add(f.codigo))} className="btn-secondary text-xs">Es nueva</button>
                          </>}
                          {e === 'nueva' && eligiendo !== f.codigo && <>
                            <label className="flex items-center gap-1 text-[11px] text-neutral-500">Costo
                              <input value={b.costo} onChange={ev => editar(f, 'costo', ev.target.value)} inputMode="decimal" placeholder="USD"
                                className="w-20 rounded-md border border-neutral-300 px-2 py-1 text-right text-xs num" />
                            </label>
                            <label className="flex items-center gap-1 text-[11px] text-neutral-500">Stock
                              <input value={b.stock} onChange={ev => editar(f, 'stock', ev.target.value)} inputMode="numeric"
                                className="w-16 rounded-md border border-neutral-300 px-2 py-1 text-right text-xs num" />
                            </label>
                            <button type="button" onClick={() => { setEligiendo(f.codigo); setEleccion('') }}
                              className="text-xs text-neutral-500 underline-offset-2 hover:text-neutral-800 hover:underline">Es uno que ya tengo</button>
                            {esNueva.has(f.codigo) && (
                              <button type="button" onClick={() => setEsNueva(s => { const n = new Set(s); n.delete(f.codigo); return n })}
                                className="text-xs text-neutral-400 hover:text-neutral-700">Deshacer</button>
                            )}
                          </>}
                          {eligiendo === f.codigo && (
                            <div className="flex items-center gap-2">
                              <Combobox value={eleccion} options={productos} placeholder="Busca el producto…" className="w-72"
                                onChange={(name, id) => { setEleccion(name); if (id) vincular(f, id, name.split(' · ')[0]) }} />
                              <button type="button" onClick={() => setEligiendo(null)} className="text-xs text-neutral-500 hover:text-neutral-800">Cancelar</button>
                            </div>
                          )}
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
            {visibles.length > pagina1.length && (
              <button type="button" onClick={() => setPagina(p => p + 1)}
                className="w-full border-t border-neutral-100 py-2.5 text-xs font-medium text-neutral-600 hover:bg-neutral-50">
                Ver más ({visibles.length - pagina1.length})
              </button>
            )}
          </div>
        </>
      )}

      {aCrear.length > 0 && (
        <div data-barra-fija className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 px-4 md:bottom-4">
          <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-3 shadow-lg">
            <p className="text-sm text-neutral-700">
              <b>{aCrear.length}</b> {aCrear.length === 1 ? 'nueva marcada' : 'nuevas marcadas'}
              {sinCosto > 0 && <span className="text-neutral-400"> · {sinCosto} sin costo (se completa después)</span>}
              {invalidas.length > 0 && <span className="text-red-600"> · revisa costo o stock de {invalidas.length}</span>}
              {aCrear.length > 200 && <span className="text-neutral-400"> · se crean de a 200</span>}
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setMarcadas(new Set())} className="btn-secondary text-sm">Desmarcar</button>
              <button type="button" onClick={crear} disabled={ocupado === 'crear' || invalidas.length > 0} className="btn-primary text-sm">
                {ocupado === 'crear' ? 'Creando…' : `Crear ${Math.min(aCrear.length, 200)} ${Math.min(aCrear.length, 200) === 1 ? 'producto' : 'productos'}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
