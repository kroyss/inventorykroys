'use client'
import { useEffect, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import Link from '@/components/ui/Link'
import { FilterPills } from '@/components/ui'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import { VistoNuevo } from '@/components/ui/Nuevo'
import PendientesPreparar from '@/components/productos/PendientesPreparar'
import { pestanasML } from '@/components/productos/PublicacionesMLTabs'
import CambiarStock from '@/components/preguntas/CambiarStock'

interface Fila {
  item_id: string; titulo: string; precio: number | null; moneda: string | null; disponible: number; estado: string
  thumbnail: string | null; sku: string | null; cuenta: string; variantes: number; editada_at: string | null
  // Fase 4 (18-11): avisos de la fila (lib/avisosPublicaciones.ts); solo vienen los que el usuario puede ver.
  sin_vincular: boolean; sin_peso: boolean; promo: string[] | null   // promo: nombres de las campañas
  stock: null | { nivel: 'vende' | 'stock'; code: string; disponible: number
                  pubs: { item_id: string; variante_id: string | null; variante: string | null; ml: number | null; queda: number; reactivar: boolean }[] }
}
type Aviso = 'stock' | 'vincular' | 'peso' | 'promo'
interface Respuesta {
  filas: Fila[]; total: number; todas: number; porPagina: number; cuentas: { id: number; nickname: string }[]
  avisos: Partial<Record<Aviso, number>>; puedeIgualar: boolean
}

const precio = (n: number | null, m: string | null) => n == null ? '—'
  : `${m === 'COP' ? '$' : 'US$'} ${n.toLocaleString('de-DE', { maximumFractionDigits: m === 'COP' ? 0 : 2, minimumFractionDigits: m === 'COP' ? 0 : 2 })}`

type Seleccion = { items?: string[]; filtro?: { q: string; cuenta: number | null; estado: string | null } }
interface Texto { id: number; tipo: 'encabezado' | 'condiciones' | 'pie'; nombre: string; texto: string; conexion_id: number | null; cuenta: string | null }

/** Publicaciones (Fase 6): buscar una publicación de las cuentas conectadas y abrir su editor. Desde 08-11 también
 *  elegir varias (o todas las de la búsqueda) y cambiarles el encabezado / pie de la descripción o el precio en lote. */
export default function PublicacionesClient() {
  const [q, setQ] = useState('')
  const [buscar, setBuscar] = useState('')
  const [cuenta, setCuenta] = useState('')
  const [estado, setEstado] = useState('')
  const [pagina, setPagina] = useState(1)
  const [aviso, setAviso] = useState<'' | Aviso>('')
  const fresco = useRef(false)
  const [r, setR] = useState<Respuesta | null>(null)
  const { data: sesion } = useSession()
  const pest = sesion?.user ? pestanasML(sesion.user) : []
  const vinc = pest.find(x => x.k === 'vincular'), envios = pest.find(x => x.k === 'envios')
  const [error, setError] = useState(false)
  const [elegidas, setElegidas] = useState<Set<string>>(new Set())
  const [todasBusqueda, setTodasBusqueda] = useState(false)
  const [accion, setAccion] = useState<null | 'descripcion' | 'precio' | 'pausar' | 'activar'>(null)
  // 08-11: «Actualizar desde ML» relee el catálogo ya (si no, las nuevas aparecen en la vuelta automática de cada 6 h).
  const [recarga, setRecarga] = useState(0)
  // 18-11 (el dueño): cambiar el stock (por variante) desde la fila, con la ventana de siempre (CambiarStock).
  const [stockDe, setStockDe] = useState<string | null>(null)
  const [actualizando, setActualizando] = useState(false)
  const actualizar = async () => {
    setActualizando(true)
    await fetch('/api/publicaciones', { method: 'POST' }).catch(() => null)
    setActualizando(false); setRecarga(n => n + 1)
  }

  useEffect(() => { const t = setTimeout(() => { setBuscar(q); setPagina(1) }, 300); return () => clearTimeout(t) }, [q])
  useEffect(() => {
    let vivo = true
    const p = new URLSearchParams({ q: buscar, cuenta, estado, pagina: String(pagina), aviso })
    if (fresco.current) { p.set('fresco', '1'); fresco.current = false }
    fetch(`/api/publicaciones?${p}`).then(x => x.ok ? x.json() : Promise.reject())
      .then(d => { if (vivo) { setR(d); setError(false) } }).catch(() => { if (vivo) setError(true) })
    return () => { vivo = false }
  }, [buscar, cuenta, estado, pagina, recarga, aviso])
  // Después de igualar: relee con el stock recién calculado (el servidor lo guarda 1 min).
  const releer = () => { fresco.current = true; setRecarga(n => n + 1) }

  const paginas = r ? Math.max(1, Math.ceil(r.total / r.porPagina)) : 1
  const limpiar = () => { setElegidas(new Set()); setTodasBusqueda(false) }
  const cuantas = todasBusqueda ? Math.min(r?.total ?? 0, 3000) : elegidas.size
  const sel: Seleccion = todasBusqueda
    ? { filtro: { q: buscar, cuenta: Number(cuenta) || null, estado: estado || null } }   // (sin el filtro de aviso: «Elegir las de esta búsqueda» se apaga con aviso)
    : { items: [...elegidas] }
  const marcar = (id: string) => { setTodasBusqueda(false); setElegidas(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n }) }
  const paginaMarcada = !!r?.filas.length && r.filas.every(f => elegidas.has(f.item_id))
  const marcarPagina = () => { setTodasBusqueda(false); setElegidas(s => { const n = new Set(s); r?.filas.forEach(f => paginaMarcada ? n.delete(f.item_id) : n.add(f.item_id)); return n }) }
  return (
    <div className="space-y-3">
      {/* 08-11 (el dueño): acciones como botones, no como links sueltos. */}
      <div className="flex flex-wrap justify-end items-center gap-2">
        <button type="button" onClick={actualizar} disabled={actualizando} className="btn-secondary !px-3 !py-1.5"
          title="Trae de MercadoLibre las publicaciones nuevas y los cambios (sola se refresca cada 6 horas)">
          <svg viewBox="0 0 20 20" className={`h-4 w-4 ${actualizando ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" strokeWidth={1.7}><path d="M16 10a6 6 0 1 1-1.8-4.3M16 3.5v3.2h-3.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          {actualizando ? 'Actualizando…' : 'Actualizar desde ML'}
        </button>
        <VistoNuevo clave="mis_publicaciones" />
        {/* 18-11 Fase 4: Vincular y Pesos (antes el submenú «Preparar») se abren desde aquí, con lo que falta. */}
        {vinc && <Link href={vinc.href} className="btn-secondary !px-3 !py-1.5" title="Unir cada publicación o variante con su producto">Vincular<PendientesPreparar de="sinVincular" /></Link>}
        {envios && <Link href={envios.href} className="btn-secondary !px-3 !py-1.5" title="Pesos de los productos y el envío gratis de MercadoEnvíos">Pesos y envío gratis<PendientesPreparar de="sinPeso" /></Link>}
        <Link href="/publicaciones/textos" className="btn-secondary !px-3 !py-1.5"><svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.7}><path d="M5 3h7l3 3v11H5z M8 9h5 M8 12h5" strokeLinecap="round" strokeLinejoin="round" /></svg>Textos de descripción</Link>
      </div>
      <div className="flex flex-wrap gap-2">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por título, SKU o número (MLV…)"
          className="flex-1 min-w-[220px] rounded-lg border border-neutral-300 px-3 py-2 text-sm" />
        {r && r.cuentas.length > 1 && (
          <select value={cuenta} onChange={e => { setCuenta(e.target.value); setPagina(1); setTodasBusqueda(false) }} className="rounded-lg border border-neutral-300 px-2 py-2 text-sm bg-white">
            <option value="">Todas las cuentas</option>
            {r.cuentas.map(c => <option key={c.id} value={c.id}>{c.nickname}</option>)}
          </select>
        )}
        <select value={estado} onChange={e => { setEstado(e.target.value); setPagina(1); setTodasBusqueda(false) }} className="rounded-lg border border-neutral-300 px-2 py-2 text-sm bg-white">
          <option value="">Activas y pausadas</option><option value="active">Activas</option><option value="paused">Pausadas</option>
        </select>
      </div>
      {r && Object.values(r.avisos ?? {}).some(n => (n ?? 0) > 0) && (
        <FilterPills value={aviso} onChange={v => { setAviso(v); setPagina(1); limpiar() }} options={[
          { value: '' as const, label: 'Todas', count: r.todas },
          ...(AVISOS_UI.filter(a => (r.avisos[a.k] ?? 0) > 0 || aviso === a.k).map(a => ({ value: a.k, label: a.t, count: r.avisos[a.k] ?? 0 }))),
        ]} />
      )}
      {error ? <p className="text-sm text-neutral-500">No se pudo cargar la lista. Prueba de nuevo.</p> : !r ? (
        <div className="space-y-2">{[0, 1, 2, 3].map(i => <div key={i} className="h-16 rounded-xl border border-neutral-200 bg-neutral-50 animate-pulse" />)}</div>
      ) : !r.filas.length ? (
        <p className="text-sm text-neutral-500 bg-white rounded-xl border border-neutral-200 px-4 py-6 text-center">
          {aviso ? 'Nada pendiente aquí. ✓' : buscar ? 'No hay publicaciones con esa búsqueda.' : 'Todavía no se leyeron las publicaciones de tus cuentas (se leen solas cada pocas horas).'}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-500">
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={paginaMarcada} onChange={marcarPagina} /> Elegir esta página</label>
            <span>{r.total.toLocaleString('es-VE')} publicaciones</span>
            {(elegidas.size > 0 || todasBusqueda) && r.total > r.filas.length && !todasBusqueda && !aviso && (
              <button type="button" onClick={() => setTodasBusqueda(true)} className="text-sky-700 hover:underline">Elegir las {Math.min(r.total, 3000).toLocaleString('es-VE')} de esta búsqueda</button>
            )}
          </div>
          <ul className="bg-white rounded-xl border border-neutral-200 shadow-sm divide-y divide-neutral-100">
            {r.filas.map(f => (
              <li key={f.item_id}>
                <div className="flex items-center">
                <input type="checkbox" className="ml-3" aria-label="Elegir" checked={todasBusqueda || elegidas.has(f.item_id)} onChange={() => marcar(f.item_id)} />
                <Link href={`/publicaciones/${f.item_id}`} className="flex flex-1 min-w-0 items-center gap-3 px-3 py-2.5 hover:bg-neutral-50">
                  <span className="w-12 h-12 shrink-0 rounded-md bg-neutral-50 border border-neutral-200 overflow-hidden">
                    {f.thumbnail && <img src={f.thumbnail.replace(/^http:/, 'https:')} alt="" loading="lazy" decoding="async" width={48} height={48} className="w-full h-full object-contain" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-neutral-900 truncate">{f.titulo}</span>
                    <span className="block text-xs text-neutral-500">
                      {f.item_id} · {f.cuenta}{f.sku ? ` · SKU ${f.sku}` : ''}{f.variantes && !r.puedeIgualar ? ` · ${f.variantes} variantes` : ''}
                      {f.editada_at && <span className="ml-1 text-sky-700">· editada aquí</span>}
                    </span>
                  </span>
                  {!r.puedeIgualar && (
                    <span className="text-right shrink-0">
                      <span className="block text-sm font-medium num">{precio(f.precio, f.moneda)}</span>
                      <span className={`block text-xs num ${f.disponible > 0 ? 'text-neutral-500' : 'text-red-600'}`}>{f.disponible} disp.</span>
                    </span>
                  )}
                  {!r.puedeIgualar && <span className="text-neutral-300">→</span>}
                </Link>
                {r.puedeIgualar && (
                  <div className="flex shrink-0 items-center">
                    <span className="text-right">
                      <span className="block text-sm font-medium num">{precio(f.precio, f.moneda)}</span>
                      {/* 18-11 (el dueño): tocar el stock abre «Cambiar stock» (un cuadro por variante), sin entrar. */}
                      <button type="button" onClick={() => setStockDe(f.item_id)}
                        title={f.variantes ? 'Ver y cambiar el stock de cada variante' : 'Cambiar el stock en MercadoLibre'}
                        className={`block w-full text-right text-xs num hover:underline ${f.disponible > 0 ? 'text-neutral-500 hover:text-neutral-800' : 'text-red-600'}`}>
                        {f.disponible} disp. <span aria-hidden="true">✎</span>
                      </button>
                      {f.variantes > 0 && (
                        <button type="button" onClick={() => setStockDe(f.item_id)} title="Ver y cambiar el stock de cada variante"
                          className="block w-full text-right text-[11px] text-sky-700 hover:underline">{f.variantes} variantes</button>
                      )}
                    </span>
                    <Link href={`/publicaciones/${f.item_id}`} className="px-3 py-2.5 text-neutral-300 hover:text-neutral-500" aria-label="Abrir la publicación">→</Link>
                  </div>
                )}
                </div>
                <AvisosFila key={`${f.item_id}-${f.estado}`} f={f} vincular={!!vinc} envios={envios?.href ?? null} onCambio={releer} />
              </li>
            ))}
          </ul>
          {stockDe && (
            <CambiarStock item={stockDe} origen="publicaciones" onCerrar={() => setStockDe(null)} onGuardado={() => releer()} />
          )}
          {cuantas > 0 && (
            <div className="sticky bottom-16 md:bottom-2 z-20 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-neutral-200 bg-white/95 backdrop-blur px-4 py-3 shadow">
              <span className="text-sm text-neutral-700">{cuantas.toLocaleString('es-VE')} elegida{cuantas === 1 ? '' : 's'}{todasBusqueda ? ' (toda la búsqueda)' : ''}</span>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={limpiar} className="btn-secondary !px-3 !py-1.5">Quitar selección</button>
                <button type="button" onClick={() => setAccion('descripcion')} className="btn-secondary !px-3 !py-1.5">Encabezado, condiciones o pie</button>
                {/* 18-11 (el dueño): pausar / activar lo elegido, junto a cambiar precio. */}
                <button type="button" onClick={() => setAccion('pausar')} className="btn-secondary !px-3 !py-1.5">Pausar</button>
                <button type="button" onClick={() => setAccion('activar')} className="btn-secondary !px-3 !py-1.5">Activar</button>
                <button type="button" onClick={() => setAccion('precio')} className="btn-primary text-sm">Cambiar precios</button>
              </div>
            </div>
          )}
          {paginas > 1 && (
            <div className="flex items-center justify-center gap-3 text-sm">
              <button type="button" disabled={pagina <= 1} onClick={() => setPagina(p => p - 1)} className="btn-secondary !px-3 !py-1">←</button>
              <span className="text-neutral-600">{pagina} de {paginas}</span>
              <button type="button" disabled={pagina >= paginas} onClick={() => setPagina(p => p + 1)} className="btn-secondary !px-3 !py-1">→</button>
            </div>
          )}
        </>
      )}
      {accion === 'descripcion' && <LoteDescripcion sel={sel} cuantas={cuantas} onCerrar={() => setAccion(null)} onHecho={limpiar} />}
      {accion === 'precio' && <LotePrecio sel={sel} onCerrar={() => setAccion(null)} onHecho={limpiar} />}
      {(accion === 'pausar' || accion === 'activar') && (
        <LoteEstado sel={sel} cuantas={cuantas} estado={accion === 'pausar' ? 'paused' : 'active'}
          onCerrar={() => { setAccion(null); setRecarga(n => n + 1) }} onHecho={limpiar} />
      )}
    </div>
  )
}

const AVISOS_UI: { k: Aviso; t: string }[] = [
  { k: 'stock', t: 'Stock distinto' }, { k: 'vincular', t: 'Sin vincular' }, { k: 'peso', t: 'Sin peso' }, { k: 'promo', t: 'En promo' },
]
const ETQ = 'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] leading-4 whitespace-nowrap'

/** Fase 4 (18-11, el dueño: «al estilo ML»): etiquetas cortas SOLO cuando algo pide atención; cada una lleva a lo que
 *  lo resuelve. Stock: solo avisa y dice la diferencia (es delicado: se analiza en Stock vs inventario, con el producto
 *  ya filtrado). En promo: las campañas al pasar el cursor; el clic abre Promociones con esa publicación. Además, el
 *  estado con su botón (Activa · Pausar / Pausada · Activar). */
function AvisosFila({ f, vincular, envios, onCambio }: {
  f: Fila; vincular: boolean; envios: string | null; onCambio: () => void
}) {
  const confirmar = useConfirm()
  const [estado, setEstado] = useState(f.estado)
  const [trabajando, setTrabajando] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const st = f.stock
  const una = st?.pubs.length === 1 ? st.pubs[0] : null
  const detalle = !st ? '' : una ? `ML ${una.ml ?? 0} · inventario ${una.queda}${una.reactivar ? ' (pausada)' : ''}`
    : st.pubs.length > 1 ? `${st.pubs.length} variantes no cuadran` : `tienes ${st.disponible}`
  const tituloStock = !st ? '' : [
    st.nivel === 'vende' ? `MercadoLibre ofrece más de lo que tienes (${st.disponible} disponibles).` : 'Lo que muestra MercadoLibre no coincide con tu inventario.',
    ...st.pubs.map(p => `${p.variante ? `${p.variante}: ` : ''}ML ${p.ml ?? 0} → según inventario ${p.queda}${p.reactivar ? ' (y activarla)' : ''}`),
    'Toca para ver el detalle en Stock vs inventario.',
  ].join('\n')
  const puedeCambiar = estado === 'active' || estado === 'paused'
  const cambiarEstado = async () => {
    const nuevo = estado === 'active' ? 'paused' : 'active'
    if (!await confirmar({
      title: nuevo === 'paused' ? 'Pausar la publicación' : 'Activar la publicación',
      message: `${f.titulo}\n${f.item_id} · ${f.cuenta}${nuevo === 'paused' ? '\n\nQueda «pausada a mano»: el stock automático no la reactiva solo.' : ''}`,
      confirmText: nuevo === 'paused' ? 'Sí, pausar' : 'Sí, activar',
    })) return
    setTrabajando(true); setMsg(null)
    try {
      const res = await fetch('/api/publicaciones/estado', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: nuevo, items: [f.item_id] }) })
      const d = await res.json().catch(() => null)
      const r0 = (d?.resultados ?? [])[0] as { ok: boolean; error?: string } | undefined
      if (!res.ok) setMsg(d?.error ?? 'No se pudo')
      else if (r0 && !r0.ok) setMsg(r0.error ?? 'MercadoLibre no aceptó el cambio')
      else { setEstado(nuevo); setMsg(nuevo === 'paused' ? '✓ Pausada' : '✓ Activa'); onCambio() }
    } catch { setMsg('No se pudo') }
    setTrabajando(false)
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5 pb-2.5 pl-[6.25rem] pr-3 -mt-1">
      {puedeCambiar ? (
        <button type="button" onClick={cambiarEstado} disabled={trabajando}
          title={estado === 'active' ? 'Activa en MercadoLibre. Toca para pausarla.' : 'Pausada en MercadoLibre. Toca para activarla.'}
          className={`${ETQ} bg-white hover:border-neutral-300 disabled:opacity-50 ${estado === 'active' ? 'border-neutral-200 text-neutral-600' : 'border-amber-200 text-amber-800'}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${estado === 'active' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
          {estado === 'active' ? 'Activa' : 'Pausada'}
          <span className="font-medium underline underline-offset-2">{trabajando ? '…' : estado === 'active' ? 'Pausar' : 'Activar'}</span>
        </button>
      ) : estado ? <span className={`${ETQ} border-neutral-200 bg-neutral-50 text-neutral-500`}>{estado === 'under_review' ? 'En revisión de ML' : estado === 'closed' ? 'Finalizada' : estado}</span> : null}
      {st && (
        <Link href={`/inventario/stock-ml?buscar=${encodeURIComponent(st.code)}`} title={tituloStock}
          className={`${ETQ} ${st.nivel === 'vende' ? 'border-red-200 bg-red-50 text-red-700 hover:border-red-300' : 'border-amber-200 bg-amber-50 text-amber-800 hover:border-amber-300'}`}>
          {st.nivel === 'vende' ? 'Vende de más' : 'Stock distinto'}{detalle && <span className="num">· {detalle}</span>}<span aria-hidden>→</span>
        </Link>
      )}
      {f.sin_vincular && (vincular
        ? <Link href={`/vincular-ml?buscar=${encodeURIComponent(f.item_id)}`} className={`${ETQ} border-sky-200 bg-sky-50 text-sky-800 hover:border-sky-300`}>Sin vincular · Vincular →</Link>
        : <span className={`${ETQ} border-sky-200 bg-sky-50 text-sky-800`}>Sin vincular</span>)}
      {f.sin_peso && (envios
        ? <Link href={envios} className={`${ETQ} border-neutral-200 bg-neutral-50 text-neutral-600 hover:border-neutral-300`}>Sin peso · Cargar →</Link>
        : <span className={`${ETQ} border-neutral-200 bg-neutral-50 text-neutral-600`}>Sin peso</span>)}
      {f.promo && (
        <Link href={`/productos/promociones?buscar=${encodeURIComponent(f.item_id)}`}
          title={`En promoción:\n${f.promo.map(n => `· ${n}`).join('\n')}\nToca para verla en Promociones.`}
          className={`${ETQ} border-lime-200 bg-lime-50 text-lime-800 hover:border-lime-300`}>
          En promo{f.promo.length > 1 && <span className="num">· {f.promo.length}</span>}
        </Link>
      )}
      {msg && <span className={`text-[11px] ${msg.startsWith('✓') ? 'text-emerald-700' : 'text-red-600'}`}>{msg}</span>}
    </div>
  )
}

/** Pausar o activar las elegidas (18-11): hasta 10 directo, más por la cola (avance como los otros lotes). */
function LoteEstado({ sel, cuantas, estado, onCerrar, onHecho }: {
  sel: Seleccion; cuantas: number; estado: 'paused' | 'active'; onCerrar: () => void; onHecho: () => void
}) {
  const [enviando, setEnviando] = useState(false)
  const [lote, setLote] = useState<number | null>(null)
  const [res, setRes] = useState<null | { ok: number; malas: { item_id: string; error?: string }[]; yaEstaban: number }>(null)
  const [error, setError] = useState<string | null>(null)
  const pausar = estado === 'paused'
  const mandar = async () => {
    setEnviando(true); setError(null)
    try {
      const r = await fetch('/api/publicaciones/estado', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ estado, lote: true, ...sel }) })
      const d = await r.json().catch(() => null)
      if (!r.ok) setError(d?.error ?? 'No se pudo')
      else if (d?.lote) { setLote(d.lote.id); onHecho() }
      else {
        const rs = (d?.resultados ?? []) as { item_id: string; ok: boolean; error?: string }[]
        setRes({ ok: rs.filter(x => x.ok).length, malas: rs.filter(x => !x.ok), yaEstaban: d?.yaEstaban ?? 0 }); onHecho()
      }
    } catch { setError('No se pudo') }
    setEnviando(false)
  }
  return (
    <Modal titulo={`${pausar ? 'Pausar' : 'Activar'} ${cuantas.toLocaleString('es-VE')} publicaci${cuantas === 1 ? 'ón' : 'ones'}`} onCerrar={() => !enviando && onCerrar()}>
      {lote ? <Listo lote={lote} onCerrar={onCerrar} /> : res ? <>
        <div className={`text-sm rounded-lg px-3 py-2 border ${res.malas.length ? 'text-amber-900 bg-amber-50 border-amber-200' : 'text-emerald-800 bg-emerald-50 border-emerald-200'}`}>
          <ul className="space-y-0.5">
            {res.ok > 0 && <li>✓ {res.ok} {pausar ? 'pausada' : 'activada'}{res.ok === 1 ? '' : 's'}</li>}
            {res.yaEstaban > 0 && <li>= {res.yaEstaban} ya {res.yaEstaban === 1 ? 'estaba' : 'estaban'} {pausar ? 'pausada' : 'activa'}{res.yaEstaban === 1 ? '' : 's'}</li>}
            {res.malas.map(m => <li key={m.item_id}>✗ {m.item_id}: {m.error ?? 'no se pudo'}</li>)}
          </ul>
        </div>
        <div className="flex justify-end"><button type="button" onClick={onCerrar} className="btn-primary text-sm">Listo</button></div>
      </> : <>
        <p className="text-sm text-neutral-600">
          {pausar
            ? 'Quedan «pausadas a mano»: el stock automático no las reactiva solo. Las que ya estaban pausadas no se tocan.'
            : 'Solo se activan las que tienen stock en MercadoLibre; las demás te dirán por qué. Las que ya estaban activas no se tocan.'}
          {' Van por la cola de MercadoLibre: ves el avance abajo a la derecha y puedes seguir trabajando.'}
        </p>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCerrar} disabled={enviando} className="btn-secondary !px-3 !py-1.5">Cancelar</button>
          <button type="button" onClick={mandar} disabled={enviando} className="btn-primary text-sm">{enviando ? 'Mandando…' : pausar ? 'Sí, pausar' : 'Sí, activar'}</button>
        </div>
      </>}
    </Modal>
  )
}

function Modal({ titulo, children, onCerrar }: { titulo: string; children: React.ReactNode; onCerrar: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onCerrar}>
      <div className="bg-white w-full sm:max-w-2xl rounded-t-2xl sm:rounded-2xl p-5 space-y-3 max-h-[88vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h3 className="font-semibold text-neutral-900">{titulo}</h3>
        {children}
      </div>
    </div>
  )
}

// 08-11 (el dueño): «Listo» muestra el resultado real del lote (cambiadas, ya lo tenían, no se pudo), no solo que se mandó.
interface AvanceLote { id: number; estado: string; total: number; ok: number; sin_cambio: number; saltadas: number; errores: number; pendientes: number }
function Listo({ lote, onCerrar }: { lote: number; onCerrar: () => void }) {
  const [a, setA] = useState<AvanceLote | null>(null)
  useEffect(() => {
    let vivo = true, t: ReturnType<typeof setTimeout> | undefined
    const leer = () => fetch('/api/publicaciones/lotes').then(r => r.ok ? r.json() : null).then(d => {
      if (!vivo) return
      const x = (d?.lotes as AvanceLote[] | undefined)?.find(l => l.id === lote) ?? null
      setA(x)
      if (!x || x.estado !== 'terminado') t = setTimeout(leer, 3000)
    }).catch(() => { if (vivo) t = setTimeout(leer, 5000) })
    leer()
    return () => { vivo = false; if (t) clearTimeout(t) }
  }, [lote])
  const listo = a?.estado === 'terminado'
  const malas = (a?.saltadas ?? 0) + (a?.errores ?? 0)
  return <>
    {!listo ? (
      <p className="text-sm text-sky-800 bg-sky-50 border border-sky-200 rounded-lg px-3 py-2">
        Mandando a MercadoLibre… {a ? <b className="num">{a.total - a.pendientes} de {a.total}</b> : null} (hasta 60 por minuto). Puedes cerrar esta pantalla: sigue solo.
      </p>
    ) : (
      <div className={`text-sm rounded-lg px-3 py-2 border ${malas ? 'text-amber-900 bg-amber-50 border-amber-200' : 'text-emerald-800 bg-emerald-50 border-emerald-200'}`}>
        <p className="font-medium">{malas ? 'Terminó, pero no todas se pudieron cambiar' : '✓ Listo'}</p>
        <ul className="mt-1 space-y-0.5">
          {a!.ok > 0 && <li>✓ {a!.ok} {a!.ok === 1 ? 'publicación actualizada' : 'publicaciones actualizadas'}</li>}
          {a!.sin_cambio > 0 && <li>= {a!.sin_cambio} ya lo tenían</li>}
          {malas > 0 && <li>✗ {malas} no se pudieron: mira el motivo en «Ver el detalle»</li>}
        </ul>
      </div>
    )}
    <div className="flex justify-end gap-2">
      <button type="button" onClick={onCerrar} className="btn-secondary !px-3 !py-1.5">Cerrar</button>
      <Link href={`/publicaciones/lotes?lote=${lote}`} className="btn-primary text-sm">{listo ? 'Ver el detalle' : 'Ver el avance'}</Link>
    </div>
  </>
}

function LoteDescripcion({ sel, cuantas, onCerrar, onHecho }: { sel: Seleccion; cuantas: number; onCerrar: () => void; onHecho: () => void }) {
  const [textos, setTextos] = useState<Texto[] | null>(null)
  const [parte, setParte] = useState<'encabezado' | 'condiciones' | 'pie'>('pie')
  const [plantilla, setPlantilla] = useState<string>('')           // '' = elegir, 'quitar' = sacarlo
  const [vista, setVista] = useState<null | { total: number; separadas: number; deOtraCuenta: number }>(null)
  const [enviando, setEnviando] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [lote, setLote] = useState<number | null>(null)
  useEffect(() => { fetch('/api/publicaciones/textos').then(r => r.json()).then(d => setTextos(d.textos ?? [])).catch(() => setTextos([])) }, [])
  const opciones = (textos ?? []).filter(t => t.tipo === parte)
  const elegido = opciones.find(t => String(t.id) === plantilla)
  const pedir = async (confirmar: boolean) => {
    setEnviando(true); setErr(null)
    try {
      const r = await fetch('/api/publicaciones/lotes', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'descripcion', seleccion: sel, parte, plantillaId: plantilla === 'quitar' ? null : Number(plantilla), confirmar }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setErr(d.error ?? 'No se pudo'); return }
      if (confirmar) { setLote(d.lote); onHecho() } else setVista(d)
    } finally { setEnviando(false) }
  }
  return (
    <Modal titulo={`Encabezado, condiciones o pie en ${(lote ? vista?.total ?? cuantas : cuantas).toLocaleString('es-VE')} publicaciones`} onCerrar={() => !enviando && onCerrar()}>
      {lote ? <Listo lote={lote} onCerrar={onCerrar} /> : <>
        <p className="text-xs text-neutral-500">Se cambia solo esa parte de la descripción; lo de cada producto queda igual. Vale para activas y pausadas.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm"><span className="text-xs font-medium text-neutral-600">Qué parte</span>
            <select value={parte} onChange={e => { setParte(e.target.value as 'encabezado' | 'condiciones' | 'pie'); setPlantilla(''); setVista(null) }} className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm bg-white">
              <option value="pie">Pie (abajo)</option><option value="condiciones">Condiciones de compra (antes del pie)</option><option value="encabezado">Encabezado (arriba)</option>
            </select></label>
          <label className="block text-sm"><span className="text-xs font-medium text-neutral-600">Poner</span>
            <select value={plantilla} onChange={e => { setPlantilla(e.target.value); setVista(null) }} className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm bg-white">
              <option value="">Elegir…</option>
              {opciones.map(t => <option key={t.id} value={t.id}>{t.nombre} ({t.cuenta ?? 'todas las cuentas'})</option>)}
              <option value="quitar">Quitarlo (dejar sin {parte === 'condiciones' ? 'condiciones de compra' : parte})</option>
            </select></label>
        </div>
        {textos && !opciones.length && <p className="text-xs text-neutral-500">No hay {parte === 'pie' ? 'pies' : parte === 'condiciones' ? 'condiciones de compra' : 'encabezados'} guardados. Créalos en <Link href="/publicaciones/textos" className="text-sky-700 hover:underline">Textos de descripción</Link>.</p>}
        {elegido && <p className="text-xs text-neutral-600 bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2 whitespace-pre-wrap max-h-40 overflow-y-auto">{elegido.texto}</p>}
        {vista && (
          <div className="text-sm bg-sky-50 border border-sky-200 text-sky-900 rounded-lg px-3 py-2 space-y-1">
            <p>Van {vista.total.toLocaleString('es-VE')} publicaciones. En cada una: si ya tiene {parte === 'condiciones' ? 'unas condiciones de compra' : `un ${parte}`} (aunque sea una versión vieja escrita a mano), se reemplaza; si no tiene, se agrega. Nunca queda repetido.</p>
            {vista.deOtraCuenta > 0 && <p className="text-amber-800">{vista.deOtraCuenta} son de otra cuenta: ese texto es solo de {elegido?.cuenta}, se saltan.</p>}
          </div>
        )}
        {err && <p className="text-xs text-red-700">{err}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCerrar} disabled={enviando} className="btn-secondary !px-3 !py-1.5">Cancelar</button>
          {!vista
            ? <button type="button" onClick={() => pedir(false)} disabled={enviando || !plantilla} className="btn-primary text-sm">{enviando ? '…' : 'Revisar'}</button>
            : <button type="button" onClick={() => pedir(true)} disabled={enviando} className="btn-primary text-sm">{enviando ? 'Creando…' : `Aplicar en ${vista.total.toLocaleString('es-VE')}`}</button>}
        </div>
      </>}
    </Modal>
  )
}

interface FilaVista { item_id: string; titulo: string; cuenta: string; moneda: string | null; antes: number | null; despues: number | null; problema: string | null }

function LotePrecio({ sel, onCerrar, onHecho }: { sel: Seleccion; onCerrar: () => void; onHecho: () => void }) {
  const [modo, setModo] = useState<'porcentaje' | 'monto' | 'fijo'>('porcentaje')
  const [valor, setValor] = useState('')
  const [redondeo, setRedondeo] = useState<'no' | 'entero' | '90'>('no')
  const [vista, setVista] = useState<FilaVista[] | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [lote, setLote] = useState<number | null>(null)
  const v = Number(valor.replace(',', '.'))
  const pedir = async (confirmar: boolean) => {
    setEnviando(true); setErr(null)
    try {
      const r = await fetch('/api/publicaciones/lotes', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'precio', seleccion: sel, modo, valor: v, redondeo, confirmar }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setErr(d.error ?? 'No se pudo'); return }
      if (confirmar) { setLote(d.lote); onHecho() } else setVista(d.vista)
    } finally { setEnviando(false) }
  }
  const cambian = vista?.filter(x => !x.problema && x.despues !== x.antes) ?? []
  const otro = () => setVista(null)
  return (
    <Modal titulo="Cambiar precios en lote" onCerrar={() => !enviando && onCerrar()}>
      {lote ? <Listo lote={lote} onCerrar={onCerrar} /> : <>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block text-sm"><span className="text-xs font-medium text-neutral-600">Cómo</span>
            <select value={modo} onChange={e => { setModo(e.target.value as 'fijo'); otro() }} className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm bg-white">
              <option value="porcentaje">Subir o bajar un %</option><option value="monto">Sumar o restar un monto</option><option value="fijo">Poner un precio fijo</option>
            </select></label>
          <label className="block text-sm"><span className="text-xs font-medium text-neutral-600">{modo === 'porcentaje' ? '% (negativo baja)' : modo === 'monto' ? 'Monto (negativo resta)' : 'Precio'}</span>
            <input inputMode="decimal" value={valor} onChange={e => { setValor(e.target.value); otro() }} placeholder={modo === 'porcentaje' ? 'Ej: 5 o -10' : ''}
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm num" /></label>
          <label className="block text-sm"><span className="text-xs font-medium text-neutral-600">Redondear</span>
            <select value={redondeo} onChange={e => { setRedondeo(e.target.value as 'no'); otro() }} className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm bg-white">
              <option value="no">No</option><option value="entero">A número entero</option><option value="90">Terminar en ,90</option>
            </select></label>
        </div>
        <p className="text-xs text-neutral-500">Es el precio de la publicación en ML (con variantes, todas). Las promociones activas pueden cambiar lo que ve el comprador.</p>
        {vista && (
          <div className="rounded-lg border border-neutral-200 max-h-72 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-neutral-50 text-neutral-500"><tr><th className="text-left px-2 py-1">Publicación</th><th className="text-right px-2 py-1">Antes</th><th className="text-right px-2 py-1">Después</th></tr></thead>
              <tbody className="divide-y divide-neutral-100">
                {vista.map(x => (
                  <tr key={x.item_id} className={x.problema ? 'text-red-700' : x.despues === x.antes ? 'text-neutral-400' : ''}>
                    <td className="px-2 py-1"><span className="block truncate max-w-[280px]">{x.titulo}</span><span className="text-neutral-400">{x.item_id} · {x.cuenta}</span></td>
                    <td className="px-2 py-1 text-right num line-through text-neutral-400">{precio(x.antes, x.moneda)}</td>
                    <td className="px-2 py-1 text-right num font-medium">{x.problema ?? precio(x.despues, x.moneda)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {vista && <p className="text-xs text-neutral-600">Cambian {cambian.length.toLocaleString('es-VE')} de {vista.length.toLocaleString('es-VE')}{vista.length - cambian.length ? ' (las demás quedan igual o tienen un problema y se saltan)' : ''}.</p>}
        {err && <p className="text-xs text-red-700">{err}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCerrar} disabled={enviando} className="btn-secondary !px-3 !py-1.5">Cancelar</button>
          {!vista
            ? <button type="button" onClick={() => pedir(false)} disabled={enviando || !valor.trim() || !Number.isFinite(v)} className="btn-primary text-sm">{enviando ? '…' : 'Ver antes → después'}</button>
            : <button type="button" onClick={() => pedir(true)} disabled={enviando || !cambian.length} className="btn-primary text-sm">{enviando ? 'Creando…' : `Confirmar ${cambian.length.toLocaleString('es-VE')} cambios`}</button>}
        </div>
      </>}
    </Modal>
  )
}
