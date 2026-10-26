'use client'
// Vincular publicaciones de ML (20-10, migración 109; API /api/vincular-ml). Una tarjeta por publicación, de la que
// más vende a la que menos; dentro, una fila por variante (cada color/modelo es un producto aparte). Cada vínculo lo
// hace una persona con un clic: el sistema solo sugiere. "No sé, para Marcos" (en clientes, "para el administrador") deja la duda con su nota.
import { createContext, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { PageHeader } from '@/components/ui'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import AvisoPesos from '@/components/preguntas/AvisoPesos'
import type { ConflictoPesos } from '@/lib/mlShipping'

interface Producto { id: number; code: string; name: string; stock: number }
interface Fila {
  codigo: string; item_id: string; cuenta: string; titulo: string; variante: string | null; disponible: number
  estado_ml: string | null; thumbnail: string | null; permalink: string | null
  estado: 'vinculada' | 'parecida' | 'nueva'
  producto: { id: number; code: string; name: string; toda: boolean } | null
  ventas60: number; vinculado_por: string | null; vinculado_at: string | null; propio: boolean
  duda: { id: number; nota: string; por: string | null; creada_at: string } | null
  otros?: { id: number; code: string; name: string }[]   // más productos con el mismo código (21-10)
  conflicto?: ConflictoPesos | null                       // …de distinto peso y el envío gratis cambia según cuál
  no_usa?: { por: string | null; creada_at: string } | null   // marcada "No se usa" (26-10)
}
interface Datos { filas: Fila[]; productos: Producto[]; hoy: { todos: number; mios: number }; esDueno: boolean }
type Filtro = 'activas' | 'pendientes' | 'dudas' | 'vinculadas' | 'no_usa' | 'todas'

const POR_PAGINA = 25

// Celular (22-10): la lista de sugerencias del navegador (datalist) casi no se puede usar en el teléfono. Ahí se abre
// un buscador a pantalla completa; en la computadora queda el de siempre.
const CELULAR = '(max-width: 639px)'
const suscribirCelular = (cb: () => void) => { const m = matchMedia(CELULAR); m.addEventListener('change', cb); return () => m.removeEventListener('change', cb) }
const useCelular = () => useSyncExternalStore(suscribirCelular, () => matchMedia(CELULAR).matches, () => false)
const sinAcentos = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
/** Palabras sueltas, en cualquier orden y sin acentos, contra código + nombre. */
function buscarProductos(productos: Producto[], q: string) {
  const palabras = sinAcentos(q).split(/\s+/).filter(Boolean)
  if (!palabras.length) return []
  return productos.filter(p => { const t = sinAcentos(`${p.code} ${p.name}`); return palabras.every(w => t.includes(w)) }).slice(0, 15)
}
/** Buscador de la lista (26-10): la publicación (título, MLV, variante) y también el producto vinculado (código, nombre). */
const textoFila = (f: Fila) => sinAcentos([f.titulo, f.item_id, f.codigo, f.variante, f.producto?.code, f.producto?.name,
  ...(f.otros ?? []).flatMap(o => [o.code, o.name])].filter(Boolean).join(' '))
/** Activa y con unidades en ML, sin producto: se vende sin descontar del inventario (lo primero a vincular). */
const activaSinVincular = (f: Fila) => f.estado !== 'vinculada' && f.estado_ml === 'active' && f.disponible > 0
const palabrasDe = (q: string) => sinAcentos(q).split(/\s+/).filter(Boolean)
const coincide = (f: Fila, palabras: string[]) => { if (!palabras.length) return true; const t = textoFila(f); return palabras.every(w => t.includes(w)) }
/** ¿Ve la pestaña Stock? (para el atajo «ver stock» de cada vínculo) */
const ConStock = createContext(false)
const fecha = (f: string) => new Date(f).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit' })

export default function VincularMLClient({ conCuentas, paraQuien = 'el administrador', buscarInicial = '', vistaInicial, conStock = false }: {
  conCuentas: boolean; paraQuien?: string; buscarInicial?: string; vistaInicial?: Filtro; conStock?: boolean
}) {
  const [datos, setDatos] = useState<Datos | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Desde Stock («Revisar vínculos») llega ?buscar=COD-…: se abre en Todas con ese producto.
  const [filtro, setFiltro] = useState<Filtro>(vistaInicial ?? (buscarInicial ? 'todas' : 'pendientes'))
  const [cuenta, setCuenta] = useState('')
  const [buscar, setBuscar] = useState(buscarInicial)
  const [ver, setVer] = useState(POR_PAGINA)
  const [hechosHoy, setHechosHoy] = useState(0)

  const cargar = () => fetch('/api/vincular-ml', { cache: 'no-store' }).then(async r => {
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setError(d.error ?? 'No se pudo cargar'); return }
    setDatos(d); setError(null)
  })
  useEffect(() => { if (conCuentas) cargar() }, [conCuentas])

  // Agrupado por publicación, ordenado por ventas de 60 días.
  const grupos = useMemo(() => {
    if (!datos) return []
    const palabras = palabrasDe(buscar)
    const m = new Map<string, { item_id: string; cuenta: string; titulo: string; thumbnail: string | null; permalink: string | null; estado_ml: string | null; filas: Fila[] }>()
    for (const f of datos.filas) {
      const k = `${f.cuenta}|${f.item_id}`
      if (!m.has(k)) m.set(k, { item_id: f.item_id, cuenta: f.cuenta, titulo: f.titulo, thumbnail: f.thumbnail, permalink: f.permalink, estado_ml: f.estado_ml, filas: [] })
      m.get(k)!.filas.push(f)
    }
    const pasa = (f: Fila) => filtro === 'todas' ? true : filtro === 'vinculadas' ? f.estado === 'vinculada'
      : filtro === 'activas' ? activaSinVincular(f)
      : filtro === 'no_usa' ? f.estado !== 'vinculada' && !!f.no_usa
      : filtro === 'dudas' ? !!f.duda : f.estado !== 'vinculada' && !f.duda && !f.no_usa
    return [...m.values()]
      .map(g => ({ ...g, ventas: g.filas.reduce((s, f) => s + f.ventas60, 0), visibles: g.filas.filter(f => pasa(f) && coincide(f, palabras)) }))
      .filter(g => g.visibles.length && (!cuenta || g.cuenta === cuenta))
      .sort((a, b) => b.ventas - a.ventas || (a.estado_ml === 'active' ? -1 : 1))
  }, [datos, filtro, cuenta, buscar])

  if (!conCuentas) return <p className="text-sm text-neutral-500">Primero hay que conectar las cuentas de MercadoLibre.</p>
  if (!datos) return <p className="text-sm text-neutral-400">{error ?? 'Cargando publicaciones…'}</p>

  // Con algo escrito en el buscador, los botones cuentan lo encontrado (para saltar a donde está).
  const palabras = palabrasDe(buscar)
  const encontradas = palabras.length ? datos.filas.filter(f => coincide(f, palabras)) : datos.filas
  const total = datos.filas.length
  const vinculadas = datos.filas.filter(f => f.estado === 'vinculada').length
  const dudas = datos.filas.filter(f => f.duda).length
  const n = {
    todas: encontradas.length,
    vinculadas: encontradas.filter(f => f.estado === 'vinculada').length,
    dudas: encontradas.filter(f => f.duda).length,
    pendientes: encontradas.filter(f => f.estado !== 'vinculada' && !f.duda && !f.no_usa).length,
    activas: encontradas.filter(activaSinVincular).length,
    no_usa: encontradas.filter(f => f.estado !== 'vinculada' && f.no_usa).length,
  }
  const cuentas = [...new Set(datos.filas.map(f => f.cuenta))].sort()
  const sinProductos = datos.productos.length === 0

  // Después de una acción: se actualiza la fila en pantalla (sin recargar todo el catálogo).
  const cambiarFila = (codigo: string, c: Partial<Fila>) =>
    setDatos(d => d && { ...d, filas: d.filas.map(f => f.codigo === codigo ? { ...f, ...c } : f) })
  const quitarFila = (codigo: string) => setDatos(d => d && { ...d, filas: d.filas.filter(f => f.codigo !== codigo) })

  const pedir = async (body: Record<string, unknown>) => {
    const r = await fetch('/api/vincular-ml', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setError(d.error ?? 'No se pudo'); return false }
    setError(null); return true
  }

  return (
    <ConStock.Provider value={conStock}>
    <div className="space-y-4">
      <PageHeader title="Vincular con MercadoLibre"
        subtitle="Une cada publicación (o cada color/modelo) con su producto. Así las ventas de ML descuentan el producto correcto."
        actions={datos.esDueno ? <Link href="/productos/importar-ml" className={`${sinProductos ? 'btn-primary' : 'btn-secondary'} text-sm`} title="Crear productos nuevos a partir de publicaciones">Crear productos desde ML</Link> : undefined} />

      {/* Sin productos todavía (25-10): no hay con qué vincular; el paso es crearlos desde las publicaciones. */}
      {sinProductos && (
        <div className="rounded-xl border border-lime-300 bg-lime-50 p-5 sm:flex sm:items-center sm:gap-6">
          <div className="flex-1">
            <div className="text-lg font-semibold text-neutral-900">Todavía no tienes productos</div>
            <p className="mt-1 text-sm text-neutral-600">
              {datos.esDueno
                ? 'Créalos desde tus publicaciones: cada una (o cada color/modelo) queda como un producto ya vinculado. Después aquí solo vinculas lo que quede suelto.'
                : `Primero ${paraQuien} tiene que crear los productos desde las publicaciones; después aquí se vinculan.`}
            </p>
          </div>
          {datos.esDueno && <Link href="/productos/importar-ml" className="btn-primary mt-3 inline-block whitespace-nowrap sm:mt-0">Importar desde MercadoLibre</Link>}
        </div>
      )}

      {/* Avance */}
      <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm">
          <span><b className="text-xl tabular-nums">{vinculadas}</b> <span className="text-neutral-500">de {total} vinculadas</span></span>
          <span className="text-neutral-500">Hoy: <b className="text-neutral-800">{datos.hoy.todos + hechosHoy}</b>{datos.hoy.mios + hechosHoy ? ` (tú ${datos.hoy.mios + hechosHoy})` : ''}</span>
          <span className="text-neutral-500">Dudas: <b className="text-neutral-800">{dudas}</b></span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-neutral-100">
          <div className="h-full rounded-full bg-lime-500" style={{ width: `${total ? Math.round(vinculadas * 100 / total) : 0}%` }} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="-mx-4 flex w-[calc(100%+2rem)] gap-2 overflow-x-auto px-4 sm:mx-0 sm:w-auto sm:overflow-visible sm:px-0">
        {([['activas', 'Activas sin vincular', n.activas], ['pendientes', 'Por vincular', n.pendientes], ['dudas', 'Dudas', n.dudas], ['vinculadas', 'Vinculadas', n.vinculadas], ['no_usa', 'No se usan', n.no_usa], ['todas', 'Todas', n.todas]] as const).map(([k, t, n]) => (
          <button key={k} onClick={() => { setFiltro(k); setVer(POR_PAGINA) }}
            className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs sm:py-1 ${filtro === k ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 bg-white text-neutral-600'}`}>
            {t} <span className="opacity-60">{n}</span>
          </button>
        ))}
        </div>
        {cuentas.length > 1 && (
          <select value={cuenta} onChange={e => { setCuenta(e.target.value); setVer(POR_PAGINA) }} className="rounded-lg border border-neutral-300 px-2 py-1 text-xs">
            <option value="">Todas las cuentas</option>
            {cuentas.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        <input type="search" value={buscar} onChange={e => { setBuscar(e.target.value); setVer(POR_PAGINA) }} placeholder="Buscar publicación, MLV, código o producto…"
          className="ml-auto w-full rounded-lg border border-neutral-300 px-3 py-2 text-base sm:w-72 sm:py-1.5 sm:text-sm" />
      </div>
      {error && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <datalist id="vml-productos">
        {datos.productos.map(p => <option key={p.id} value={`${p.code} · ${p.name}`}>{`stock ${p.stock}`}</option>)}
      </datalist>

      {grupos.length === 0 ? (
        <p className="rounded-xl border border-dashed border-neutral-300 px-4 py-10 text-center text-sm text-neutral-500">
          {filtro === 'pendientes' ? '¡No queda nada por vincular con este filtro! 🎉' : 'Nada en esta vista.'}
        </p>
      ) : (
        <div className="space-y-3">
          {grupos.slice(0, ver).map(g => (
            <section key={`${g.cuenta}|${g.item_id}`} className="scroll-mt-16 rounded-xl border border-neutral-200 bg-white shadow-sm">
              <div className="flex items-start gap-3 border-b border-neutral-100 px-4 py-3">
                {g.thumbnail
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={g.thumbnail} alt="" className="h-14 w-14 shrink-0 rounded-md border object-contain" />
                  : <div className="h-14 w-14 shrink-0 rounded-md bg-neutral-100" />}
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-neutral-900">{g.titulo}</div>
                  <div className="text-xs text-neutral-500">
                    {g.cuenta} · {g.permalink ? <a href={g.permalink} target="_blank" rel="noreferrer" className="font-mono underline">{g.item_id}</a> : <span className="font-mono">{g.item_id}</span>}
                    {g.estado_ml && g.estado_ml !== 'active' && <span className="ml-1 text-amber-700">· pausada</span>}
                  </div>
                </div>
                <div className="shrink-0 text-right text-xs text-neutral-500"><b className="text-base tabular-nums text-neutral-900">{g.ventas}</b><div>vendidas 60 d</div></div>
              </div>
              <ul className="divide-y divide-neutral-100">
                {g.visibles.map(f => (
                  <FilaVariante key={f.codigo} f={f} productos={datos.productos} esDueno={datos.esDueno} paraQuien={paraQuien} pedir={pedir}
                    hermanas={g.filas.length} onQuitar={() => quitarFila(f.codigo)}
                    onCambio={(c, sumaHoy) => { cambiarFila(f.codigo, c); if (sumaHoy) setHechosHoy(n => n + sumaHoy) }} />
                ))}
              </ul>
            </section>
          ))}
          {grupos.length > ver && (
            <button onClick={() => setVer(v => v + POR_PAGINA)} className="btn-secondary w-full text-sm">Ver {Math.min(POR_PAGINA, grupos.length - ver)} más ({grupos.length - ver} quedan)</button>
          )}
        </div>
      )}
    </div>
    </ConStock.Provider>
  )
}

function FilaVariante({ f, productos, esDueno, paraQuien, pedir, hermanas, onQuitar, onCambio }: {
  f: Fila; productos: Producto[]; esDueno: boolean; paraQuien: string
  pedir: (b: Record<string, unknown>) => Promise<boolean>
  hermanas: number; onQuitar: () => void
  onCambio: (c: Partial<Fila>, sumaHoy?: number) => void
}) {
  const confirm = useConfirm()
  const celular = useCelular()
  const conStock = useContext(ConStock)
  const [modo, setModo] = useState<'nada' | 'elegir' | 'duda'>('nada')
  const [texto, setTexto] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const elegido = productos.find(p => `${p.code} · ${p.name}` === texto)

  const vincularA = async (p: { id: number; code: string; name: string }) => {
    setOcupado(true)
    const ok = await pedir({ accion: 'vincular', codigo: f.codigo, cuenta: f.cuenta, product_id: p.id })
    setOcupado(false)
    if (ok) { onCambio({ estado: 'vinculada', producto: { ...p, toda: false }, vinculado_por: 'tú', vinculado_at: new Date().toISOString(), propio: true, duda: null }, 1); setModo('nada'); setTexto('') }
  }

  return (
    <li className={`scroll-mt-16 px-4 py-2.5 text-sm ${modo === 'elegir' && celular ? 'bg-lime-50/60' : ''}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <div className="min-w-[10rem] flex-1">
          <span className="font-medium text-neutral-800">{f.variante ?? 'Publicación sin variantes'}</span>
          <span className="ml-2 text-xs text-neutral-400">{f.ventas60} vendidas · disponible {f.disponible}</span>
        </div>

        {f.estado === 'vinculada' && f.producto ? (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-green-800">✓ {f.producto.code} · {f.producto.name}</span>
            {f.producto.toda && <span className="text-neutral-400" title="Vinculada por la publicación entera, no por esta variante">(toda la publicación)</span>}
            {f.vinculado_por && <span className="text-neutral-400">{f.vinculado_por}{f.vinculado_at ? ` · ${fecha(f.vinculado_at)}` : ''}</span>}
            {conStock && <Link href={`/inventario/stock-ml?buscar=${encodeURIComponent(f.producto.code)}`} className="text-neutral-500 underline hover:text-neutral-800"
              title="Cuántas muestra cada publicación de este producto y cuántas debería mostrar">ver stock</Link>}
            {!f.producto.toda && (esDueno || f.propio) && (
              <button disabled={ocupado} className="text-neutral-500 underline hover:text-red-600" onClick={async () => {
                if (!await confirm({ title: 'Deshacer el vínculo', message: `Se separa "${f.variante ?? f.titulo}" de ${f.producto!.name}.`, confirmText: 'Deshacer' })) return
                setOcupado(true)
                const ok = await pedir({ accion: 'desvincular', codigo: f.codigo, product_id: f.producto!.id })
                setOcupado(false)
                // Si había otro producto con el mismo código, ese queda como el vinculado.
                if (ok) onCambio(f.otros?.length
                  ? { producto: { ...f.otros[0], toda: false }, otros: f.otros.slice(1), conflicto: null }
                  : { estado: 'nueva', producto: null, vinculado_por: null, vinculado_at: null, propio: false }, f.propio && f.vinculado_por === 'tú' ? -1 : 0)
              }}>Deshacer</button>
            )}
            {/* Más productos con el mismo código (21-10): antes quedaban escondidos detrás del primero. */}
            {f.otros?.map(o => (
              <span key={o.id} className="inline-flex items-center gap-2">
                <span className="rounded-full bg-green-100 px-2 py-0.5 text-green-800">✓ {o.code} · {o.name}</span>
                {esDueno && (
                  <button disabled={ocupado} className="text-neutral-500 underline hover:text-red-600" onClick={async () => {
                    if (!await confirm({ title: 'Deshacer el vínculo', message: `Se separa "${f.variante ?? f.titulo}" de ${o.name}.`, confirmText: 'Deshacer' })) return
                    setOcupado(true)
                    const ok = await pedir({ accion: 'desvincular', codigo: f.codigo, product_id: o.id })
                    setOcupado(false)
                    if (ok) onCambio({ otros: f.otros!.filter(x => x.id !== o.id), conflicto: null })
                  }}>Deshacer</button>
                )}
              </span>
            ))}
            <AvisoPesos c={f.conflicto} />
          </div>
        ) : (
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
            {/* 20-10: la sugerencia es texto para LEER, no un botón grande (se tocaba rápido sin revisar) y pide confirmar. */}
            {f.estado === 'parecida' && f.producto && (
              <>
                <span className="text-xs text-neutral-500">¿Es este? <span className="text-neutral-800">{f.producto.code} · {f.producto.name}</span></span>
                <button disabled={ocupado} className="btn-secondary w-full text-xs disabled:opacity-50 sm:w-auto" onClick={async () => {
                  if (!await confirm({ title: '¿Es el mismo producto?', confirmText: 'Sí, vincular', cancelText: 'No, revisar',
                    message: `Publicación: ${f.titulo}${f.variante ? ` · ${f.variante}` : ''}

Producto: ${f.producto!.code} · ${f.producto!.name}

Si no es exactamente el mismo (modelo, medida, color), toca «No» y usa «Es otro…».` })) return
                  vincularA(f.producto!)
                }}>Sí, es este</button>
              </>
            )}
            {productos.length > 0 && <button onClick={() => setModo(modo === 'elegir' ? 'nada' : 'elegir')} className="btn-secondary w-full text-xs sm:w-auto">{f.estado === 'parecida' ? 'Es otro…' : 'Elegir producto…'}</button>}
            {!f.duda && productos.length > 0 && <button onClick={() => setModo(modo === 'duda' ? 'nada' : 'duda')} className="py-1 text-xs text-neutral-500 underline sm:py-0">No sé, para {paraQuien}</button>}
            {/* Variantes viejas (26-10): lo decide una persona, nunca solo. */}
            {!f.no_usa && (
              <button disabled={ocupado} title="Sale de «Por vincular» (no toca MercadoLibre). Se deshace en «No se usan»"
                className="py-1 text-xs text-neutral-500 underline disabled:opacity-50 sm:py-0" onClick={async () => {
                  setOcupado(true)
                  const ok = await pedir({ accion: 'no_usa', codigo: f.codigo, valor: true, cuenta: f.cuenta, titulo: f.titulo, variante: f.variante })
                  setOcupado(false)
                  if (ok) onCambio({ no_usa: { por: 'tú', creada_at: new Date().toISOString() } })
                }}>No se usa</button>
            )}
            {esDueno && f.codigo.includes(':') && hermanas > 1 && (
              <button disabled={ocupado} title="Borra esta variante de la publicación en MercadoLibre"
                className="py-1 text-xs text-red-600 underline disabled:opacity-50 sm:py-0" onClick={async () => {
                  if (!await confirm({ title: 'Eliminar variante en MercadoLibre', confirmText: 'Eliminar en ML', cancelText: 'Cancelar',
                    message: `Se elimina «${f.variante}» de la publicación ${f.item_id} en ${f.cuenta}.\n\nLas demás variantes no cambian. No se puede deshacer.` })) return
                  setOcupado(true)
                  const ok = await pedir({ accion: 'eliminar_variante', codigo: f.codigo })
                  setOcupado(false)
                  if (ok) onQuitar()
                }}>Eliminar en ML</button>
            )}
          </div>
        )}
      </div>

      {f.no_usa && f.estado !== 'vinculada' && (
        <div className="mt-1.5 flex flex-wrap items-center gap-2 rounded-md bg-neutral-100 px-2 py-1 text-xs text-neutral-600">
          <span>No se usa{f.no_usa.por ? ` · ${f.no_usa.por}` : ''} · {fecha(f.no_usa.creada_at)}</span>
          <button disabled={ocupado} className="underline disabled:opacity-50" onClick={async () => {
            setOcupado(true)
            const ok = await pedir({ accion: 'no_usa', codigo: f.codigo, valor: false })
            setOcupado(false)
            if (ok) onCambio({ no_usa: null })
          }}>Deshacer</button>
        </div>
      )}
      {f.duda && (
        <div className="mt-1.5 flex flex-wrap items-center gap-2 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-900">
          ❓ {f.duda.por ?? '—'}: “{f.duda.nota}”
          {esDueno && f.estado !== 'vinculada' && (
            <button className="ml-auto underline" onClick={async () => { if (await pedir({ accion: 'ignorar', id: f.duda!.id })) onCambio({ duda: null }) }}>
              Ignorar (no se vincula)
            </button>
          )}
        </div>
      )}

      {modo === 'elegir' && celular && (
        <SelectorCelular f={f} productos={productos} ocupado={ocupado} onElegir={vincularA} onCerrar={() => { setModo('nada'); setTexto('') }} />
      )}
      {modo === 'elegir' && !celular && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input list="vml-productos" value={texto} onChange={e => setTexto(e.target.value)} autoFocus placeholder="Buscar producto por nombre o código…"
            className="min-w-[16rem] flex-1 rounded border border-neutral-300 px-2 py-1 text-sm" />
          <button disabled={!elegido || ocupado} onClick={() => elegido && vincularA(elegido)} className="btn-primary text-xs disabled:opacity-50">Vincular</button>
          <button onClick={() => { setModo('nada'); setTexto('') }} className="btn-ghost text-xs">Cancelar</button>
        </div>
      )}
      {modo === 'duda' && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input value={texto} onChange={e => setTexto(e.target.value)} autoFocus maxLength={300} placeholder="¿Qué duda tienes? (ej.: no encuentro el color wengue)"
            className="w-full flex-1 rounded border border-neutral-300 px-2 py-2 text-base sm:w-auto sm:min-w-[16rem] sm:py-1 sm:text-sm" />
          <button disabled={texto.trim().length < 2 || ocupado} className="btn-secondary text-xs disabled:opacity-50" onClick={async () => {
            setOcupado(true)
            const ok = await pedir({ accion: 'duda', codigo: f.codigo, cuenta: f.cuenta, titulo: f.titulo, variante: f.variante, nota: texto.trim() })
            setOcupado(false)
            if (ok) { onCambio({ duda: { id: 0, nota: texto.trim(), por: 'tú', creada_at: new Date().toISOString() } }); setModo('nada'); setTexto('') }
          }}>Enviar duda</button>
          <button onClick={() => { setModo('nada'); setTexto('') }} className="btn-ghost text-xs">Cancelar</button>
        </div>
      )}
    </li>
  )
}

/** Buscador del celular, DENTRO de la tarjeta (22-10: a pantalla completa se perdía de vista qué se vinculaba).
 *  Al abrir, la página deja arriba la foto y el título de la publicación (o, si la variante queda muy abajo, la
 *  variante con un recordatorio del título). Tocar un producto solo lo marca: vincula el botón, así un toque al
 *  deslizar no vincula nada. */
function SelectorCelular({ f, productos, ocupado, onElegir, onCerrar }: {
  f: Fila; productos: Producto[]; ocupado: boolean
  onElegir: (p: Producto) => void; onCerrar: () => void
}) {
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<Producto | null>(null)
  const [recordar, setRecordar] = useState(false)
  const caja = useRef<HTMLDivElement>(null)
  const entrada = useRef<HTMLInputElement>(null)
  const res = useMemo(() => buscarProductos(productos, q), [productos, q])

  useEffect(() => {
    const li = caja.current?.closest('li'), tarjeta = caja.current?.closest('section')
    if (!li || !tarjeta) return
    const lejos = li.getBoundingClientRect().top - tarjeta.getBoundingClientRect().top > 160
    ;(lejos ? li : tarjeta).scrollIntoView({ block: 'start', behavior: 'smooth' })
    setRecordar(lejos)
    entrada.current?.focus({ preventScroll: true })
  }, [])

  return (
    <div ref={caja} className="mt-2 space-y-2 rounded-lg border border-lime-300 bg-lime-50/40 p-2">
      {recordar && (
        <div className="flex items-center gap-2 text-xs text-neutral-600">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {f.thumbnail && <img src={f.thumbnail} alt="" className="h-8 w-8 shrink-0 rounded border bg-white object-contain" />}
          <span className="line-clamp-2">{f.titulo}</span>
        </div>
      )}
      <input ref={entrada} type="search" value={q} onChange={e => { setQ(e.target.value); setSel(null) }}
        placeholder="Nombre o código del producto…" className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-base" />
      <div className="flex gap-2">
        <button disabled={!sel || ocupado} onClick={() => sel && onElegir(sel)} className="btn-primary flex-1 disabled:opacity-50">
          {sel ? `Vincular con ${sel.code}` : 'Toca un producto'}
        </button>
        <button onClick={onCerrar} className="btn-secondary">Cancelar</button>
      </div>
      {q.trim() && (res.length === 0
        ? <p className="px-1 py-3 text-center text-sm text-neutral-400">No hay productos con eso.</p>
        : <ul className="divide-y divide-neutral-100 overflow-hidden rounded-lg border border-neutral-200 bg-white">
            {res.map(p => (
              <li key={p.id}>
                <button onClick={() => setSel(p)}
                  className={`flex w-full items-start gap-3 px-3 py-3 text-left ${sel?.id === p.id ? 'bg-lime-50' : 'active:bg-neutral-50'}`}>
                  <span className={`mt-1 h-4 w-4 shrink-0 rounded-full border ${sel?.id === p.id ? 'border-lime-600 bg-lime-500' : 'border-neutral-300'}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-neutral-900">{p.name}</span>
                    <span className="block text-xs text-neutral-500"><span className="font-mono">{p.code}</span> · stock {p.stock}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>)}
      {!q.trim() && <p className="px-1 text-xs text-neutral-500">Escribe parte del nombre (las palabras en cualquier orden) o el código.</p>}
    </div>
  )
}
