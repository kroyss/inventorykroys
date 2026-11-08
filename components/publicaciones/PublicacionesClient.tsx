'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

interface Fila {
  item_id: string; titulo: string; precio: number | null; moneda: string | null; disponible: number; estado: string
  thumbnail: string | null; sku: string | null; cuenta: string; variantes: number; editada_at: string | null
}
interface Respuesta { filas: Fila[]; total: number; porPagina: number; cuentas: { id: number; nickname: string }[] }

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
  const [r, setR] = useState<Respuesta | null>(null)
  const [error, setError] = useState(false)
  const [elegidas, setElegidas] = useState<Set<string>>(new Set())
  const [todasBusqueda, setTodasBusqueda] = useState(false)
  const [accion, setAccion] = useState<null | 'descripcion' | 'precio'>(null)
  // 08-11: «Actualizar desde ML» relee el catálogo ya (si no, las nuevas aparecen en la vuelta automática de cada 6 h).
  const [recarga, setRecarga] = useState(0)
  const [actualizando, setActualizando] = useState(false)
  const actualizar = async () => {
    setActualizando(true)
    await fetch('/api/publicaciones', { method: 'POST' }).catch(() => null)
    setActualizando(false); setRecarga(n => n + 1)
  }

  useEffect(() => { const t = setTimeout(() => { setBuscar(q); setPagina(1) }, 300); return () => clearTimeout(t) }, [q])
  useEffect(() => {
    let vivo = true
    const p = new URLSearchParams({ q: buscar, cuenta, estado, pagina: String(pagina) })
    fetch(`/api/publicaciones?${p}`).then(x => x.ok ? x.json() : Promise.reject())
      .then(d => { if (vivo) { setR(d); setError(false) } }).catch(() => { if (vivo) setError(true) })
    return () => { vivo = false }
  }, [buscar, cuenta, estado, pagina, recarga])

  const paginas = r ? Math.max(1, Math.ceil(r.total / r.porPagina)) : 1
  const limpiar = () => { setElegidas(new Set()); setTodasBusqueda(false) }
  const cuantas = todasBusqueda ? Math.min(r?.total ?? 0, 3000) : elegidas.size
  const sel: Seleccion = todasBusqueda
    ? { filtro: { q: buscar, cuenta: Number(cuenta) || null, estado: estado || null } }
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
        <Link href="/publicaciones/textos" className="btn-secondary !px-3 !py-1.5"><svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.7}><path d="M5 3h7l3 3v11H5z M8 9h5 M8 12h5" strokeLinecap="round" strokeLinejoin="round" /></svg>Textos de descripción</Link>
        <Link href="/publicaciones/lotes" className="btn-secondary !px-3 !py-1.5"><svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.7}><rect x="3" y="3" width="6" height="6" rx="1" /><rect x="11" y="3" width="6" height="6" rx="1" /><rect x="3" y="11" width="6" height="6" rx="1" /><rect x="11" y="11" width="6" height="6" rx="1" /></svg>Cambios en lote</Link>
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
      {error ? <p className="text-sm text-neutral-500">No se pudo cargar la lista. Prueba de nuevo.</p> : !r ? (
        <div className="space-y-2">{[0, 1, 2, 3].map(i => <div key={i} className="h-16 rounded-xl border border-neutral-200 bg-neutral-50 animate-pulse" />)}</div>
      ) : !r.filas.length ? (
        <p className="text-sm text-neutral-500 bg-white rounded-xl border border-neutral-200 px-4 py-6 text-center">
          {buscar ? 'No hay publicaciones con esa búsqueda.' : 'Todavía no se leyeron las publicaciones de tus cuentas (se leen solas cada pocas horas).'}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-500">
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={paginaMarcada} onChange={marcarPagina} /> Elegir esta página</label>
            <span>{r.total.toLocaleString('es-VE')} publicaciones</span>
            {(elegidas.size > 0 || todasBusqueda) && r.total > r.filas.length && !todasBusqueda && (
              <button type="button" onClick={() => setTodasBusqueda(true)} className="text-sky-700 hover:underline">Elegir las {Math.min(r.total, 3000).toLocaleString('es-VE')} de esta búsqueda</button>
            )}
          </div>
          <ul className="bg-white rounded-xl border border-neutral-200 shadow-sm divide-y divide-neutral-100">
            {r.filas.map(f => (
              <li key={f.item_id} className="flex items-center">
                <input type="checkbox" className="ml-3" aria-label="Elegir" checked={todasBusqueda || elegidas.has(f.item_id)} onChange={() => marcar(f.item_id)} />
                <Link href={`/publicaciones/${f.item_id}`} className="flex flex-1 min-w-0 items-center gap-3 px-3 py-2.5 hover:bg-neutral-50">
                  <span className="w-12 h-12 shrink-0 rounded-md bg-neutral-50 border border-neutral-200 overflow-hidden">
                    {f.thumbnail && <img src={f.thumbnail.replace(/^http:/, 'https:')} alt="" className="w-full h-full object-contain" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-neutral-900 truncate">{f.titulo}</span>
                    <span className="block text-xs text-neutral-500">
                      {f.item_id} · {f.cuenta}{f.sku ? ` · SKU ${f.sku}` : ''}{f.variantes ? ` · ${f.variantes} variantes` : ''}
                      {f.estado === 'paused' && <span className="ml-1 text-amber-700">· Pausada</span>}
                      {f.editada_at && <span className="ml-1 text-sky-700">· editada aquí</span>}
                    </span>
                  </span>
                  <span className="text-right shrink-0">
                    <span className="block text-sm font-medium num">{precio(f.precio, f.moneda)}</span>
                    <span className={`block text-xs num ${f.disponible > 0 ? 'text-neutral-500' : 'text-red-600'}`}>{f.disponible} disp.</span>
                  </span>
                  <span className="text-neutral-300">→</span>
                </Link>
              </li>
            ))}
          </ul>
          {cuantas > 0 && (
            <div className="sticky bottom-16 md:bottom-2 z-20 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-neutral-200 bg-white/95 backdrop-blur px-4 py-3 shadow">
              <span className="text-sm text-neutral-700">{cuantas.toLocaleString('es-VE')} elegida{cuantas === 1 ? '' : 's'}{todasBusqueda ? ' (toda la búsqueda)' : ''}</span>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={limpiar} className="btn-secondary !px-3 !py-1.5">Quitar selección</button>
                <button type="button" onClick={() => setAccion('descripcion')} className="btn-secondary !px-3 !py-1.5">Encabezado / pie</button>
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
    </div>
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

function Listo({ lote, onCerrar }: { lote: number; onCerrar: () => void }) {
  return <>
    <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
      ✓ Listo. Se va mandando a MercadoLibre de a poco (unas 12 por minuto) aunque cierres esta pantalla.
    </p>
    <div className="flex justify-end gap-2">
      <button type="button" onClick={onCerrar} className="btn-secondary !px-3 !py-1.5">Cerrar</button>
      <Link href={`/publicaciones/lotes?lote=${lote}`} className="btn-primary text-sm">Ver el avance</Link>
    </div>
  </>
}

function LoteDescripcion({ sel, cuantas, onCerrar, onHecho }: { sel: Seleccion; cuantas: number; onCerrar: () => void; onHecho: () => void }) {
  const [textos, setTextos] = useState<Texto[] | null>(null)
  const [parte, setParte] = useState<'encabezado' | 'condiciones' | 'pie'>('pie')
  const [plantilla, setPlantilla] = useState<string>('')           // '' = elegir, 'quitar' = sacarlo
  const [noRec, setNoRec] = useState<'saltar' | 'agregar'>('saltar')
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
        body: JSON.stringify({ tipo: 'descripcion', seleccion: sel, parte, plantillaId: plantilla === 'quitar' ? null : Number(plantilla), noReconocida: noRec, confirmar }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setErr(d.error ?? 'No se pudo'); return }
      if (confirmar) { setLote(d.lote); onHecho() } else setVista(d)
    } finally { setEnviando(false) }
  }
  return (
    <Modal titulo={`Encabezado, condiciones o pie en ${cuantas.toLocaleString('es-VE')} publicaciones`} onCerrar={() => !enviando && onCerrar()}>
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
        {plantilla && plantilla !== 'quitar' && (
          <fieldset className="text-sm space-y-1">
            <legend className="text-xs font-medium text-neutral-600">Si en una publicación no se reconoce {parte === 'condiciones' ? 'las condiciones de compra que tiene' : `el ${parte} que tiene`} ahora</legend>
            <label className="flex gap-2"><input type="radio" checked={noRec === 'saltar'} onChange={() => { setNoRec('saltar'); setVista(null) }} /> <span>Saltarla (no tocarla) <span className="text-neutral-400">· recomendado, así no queda repetido</span></span></label>
            <label className="flex gap-2"><input type="radio" checked={noRec === 'agregar'} onChange={() => { setNoRec('agregar'); setVista(null) }} /> <span>Agregarlo igual {parte === 'pie' ? 'al final' : parte === 'condiciones' ? 'antes del pie' : 'al principio'}</span></label>
          </fieldset>
        )}
        {vista && (
          <div className="text-sm bg-sky-50 border border-sky-200 text-sky-900 rounded-lg px-3 py-2 space-y-1">
            <p>Van {vista.total.toLocaleString('es-VE')} publicaciones. {vista.separadas.toLocaleString('es-VE')} ya están separadas en partes{vista.total - vista.separadas > 0 ? `; las otras ${(vista.total - vista.separadas).toLocaleString('es-VE')} se leen de ML al momento y se reconocen con tus textos guardados` : ''}.</p>
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
