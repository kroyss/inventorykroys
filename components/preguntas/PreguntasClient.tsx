'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { PageHeader, Tabs, Pagination, EmptyState, Cargando, StatusBadge } from '@/components/ui'
import { CREDITOS_TXT, CREDITOS_WEB_TXT, Sugerencias, UsoIA, avisarUsoIA, type Sugerencia } from '@/components/preguntas/AyudaIA'
import { PreguntasPrevias } from '@/components/preguntas/PreguntasPrevias'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import { problemasDelTexto, revisarTexto, plantillaAplica, condicionPlantilla, type Plantilla } from '@/lib/preguntasTexto'

interface Pregunta {
  id: string; item_id: string; item_titulo: string | null; item_permalink: string | null; item_estado: string | null; item_imagen?: string | null; item_variantes?: number | null
  texto: string; estado: string; fecha: string
  respuesta: string | null; respuesta_estado: string | null; respuesta_fecha: string | null
  borrador: string | null; borrador_confianza: 'alta' | 'media' | 'baja' | null; borrador_falta: string | null
  borrador_web: boolean; borrador_at: string | null
  cuenta: string; respondida_por: string | null
  producto_code: string | null; producto_nombre: string | null; producto_stock: number | null
  producto_precio: number | null
  comprador_id: string | null; previas: number
  item_precio: number | null; item_precio_original: number | null; item_moneda: string | null
}

// Precio para decidir (regla de los $3, respuesta rápida en verde): SOLO el de MercadoLibre
// (el que ve el comprador, con la promoción). El del inventario no aplica aquí.
function precioUSD(p: Pregunta) {
  return p.item_precio && (p.item_moneda ?? 'USD') === 'USD' ? p.item_precio : null
}

// Link a la publicación: el que trajo ML o, si ML no dejó leerla, armado con el código.
function linkPublicacion(p: Pregunta) {
  if (p.item_permalink) return p.item_permalink
  const m = /^(ML[A-Z]|MCO)(\d+)$/.exec(p.item_id)
  if (!m) return null
  const dominio = m[1] === 'MCO' ? 'com.co' : 'com.ve'
  return `https://articulo.mercadolibre.${dominio}/${m[1]}-${m[2]}-_JM`
}

/** Miniatura de la publicación (como en ML): títulos parecidos se distinguen de un vistazo. Abre la publicación. */
function Foto({ p, chica = false }: { p: Pregunta; chica?: boolean }) {
  const link = linkPublicacion(p)
  const tam = chica ? 'w-10 h-10' : 'w-12 h-12 sm:w-14 sm:h-14'
  const caja = `${tam} shrink-0 rounded-lg border border-neutral-200 bg-white overflow-hidden flex items-center justify-center`
  const img = p.item_imagen
    ? <img src={p.item_imagen} alt="" loading="lazy" className="w-full h-full object-contain" />
    : <svg viewBox="0 0 24 24" className="w-5 h-5 text-neutral-300" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="M21 17l-5-5-9 8" /></svg>
  return link
    ? <a href={link} target="_blank" rel="noreferrer" title="Ver la publicación en MercadoLibre" className={`${caja} hover:border-neutral-400`}>{img}</a>
    : <div className={`${caja} bg-neutral-50`}>{img}</div>
}

/** Producto de la pregunta: nombre del sistema (o título de ML) + código + stock. */
// Límite de precio de las respuestas rápidas (p. ej. "menos de $3 → mínimo 2 unidades"):
// debajo de él el precio se resalta para responder con la regla correcta.
function umbralDe(plantillas: Plantilla[]) {
  const h = plantillas.map(p => p.precio_hasta).filter((x): x is number => typeof x === 'number' && x > 0)
  return h.length ? Math.min(...h) : null
}
const usd = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function Producto({ p, umbral = null }: { p: Pregunta; umbral?: number | null }) {
  const nombre = p.producto_nombre ?? p.item_titulo
  const link = linkPublicacion(p)
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0">
      {link
        ? <a href={link} target="_blank" rel="noreferrer" title="Ver la publicación en MercadoLibre"
            className={`line-clamp-2 sm:truncate max-w-[30rem] hover:underline underline-offset-2 ${nombre ? 'font-medium text-neutral-800' : 'text-neutral-500'}`}>
            {nombre ?? 'Publicación sin vincular a un producto'} <span className="text-neutral-400">↗</span>
          </a>
        : nombre
          ? <span className="font-medium text-neutral-800 line-clamp-2 sm:truncate max-w-[30rem]">{nombre}</span>
          : <span className="text-neutral-500">Publicación sin vincular a un producto</span>}
      {p.producto_code && <span className="hidden sm:inline font-mono text-neutral-400">{p.producto_code}</span>}
      <Precio p={p} umbral={umbral} />
      {p.producto_stock !== null && (
        <span className={p.producto_stock > 0 ? 'text-emerald-700' : 'text-red-600'}>
          {p.producto_stock > 0 ? `${p.producto_stock} en stock` : 'Sin stock'}
        </span>
      )}
      {!!p.item_variantes && <VerVariantes item={p.item_id} n={p.item_variantes} />}
      <span className="hidden sm:inline font-mono text-neutral-400">{p.item_id}</span>
    </span>
  )
}

/** "Ver variantes" (como en ML): ventana con cada combinación y su stock, leído de ML al abrirla. */
function VerVariantes({ item, n }: { item: string; n: number }) {
  const [abierta, setAbierta] = useState(false)
  const [datos, setDatos] = useState<{ atributos: string[]; filas: { valores: string[]; stock: number }[] } | { error: string } | null>(null)
  const abrir = async () => {
    setAbierta(true); setDatos(null)
    const r = await fetch(`/api/preguntas/variantes?item=${item}`)
    const d = await r.json().catch(() => ({ error: 'No se pudo leer' }))
    setDatos(r.ok ? d : { error: d.error ?? 'No se pudo leer' })
  }
  useEffect(() => {
    if (!abierta) return
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierta(false) }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [abierta])
  return <>
    <button type="button" onClick={abrir} className="text-sky-700 hover:underline underline-offset-2 font-medium">Ver variantes ({n})</button>
    {abierta && (
      <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setAbierta(false)} role="dialog" aria-label="Stock por variante">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-neutral-100">
            <h3 className="text-base font-semibold text-neutral-900">Stock por variante</h3>
            <button onClick={() => setAbierta(false)} className="text-neutral-400 hover:text-neutral-700 text-xl leading-none" aria-label="Cerrar">✕</button>
          </div>
          <div className="overflow-y-auto">
            {!datos ? <p className="px-5 py-6 text-sm text-neutral-400">Leyendo de MercadoLibre…</p>
              : 'error' in datos ? <p className="px-5 py-6 text-sm text-red-600">{datos.error}</p>
              : datos.filas.length === 0 ? <p className="px-5 py-6 text-sm text-neutral-500">Esta publicación ya no tiene variantes.</p>
              : (
                <table className="w-full text-sm">
                  <thead className="bg-neutral-50 text-xs text-neutral-500 sticky top-0">
                    <tr>
                      {datos.atributos.map(a => <th key={a} className="px-5 py-2 text-left font-medium">{a}</th>)}
                      <th className="px-5 py-2 text-right font-medium">Stock</th>
                    </tr>
                  </thead>
                  <tbody>
                    {datos.filas.map((f, i) => (
                      <tr key={i} className="border-t border-neutral-100">
                        {f.valores.map((v, j) => <td key={j} className="px-5 py-2.5 text-neutral-800">{v}</td>)}
                        <td className={`px-5 py-2.5 text-right num ${f.stock > 0 ? 'text-neutral-800' : 'text-red-600'}`}>{f.stock} u.</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
          </div>
        </div>
      </div>
    )}
  </>
}
/** Precio en MercadoLibre ahora (con la promoción; el anterior, tachado). */
function Precio({ p, umbral }: { p: Pregunta; umbral: number | null }) {
  if (!p.item_precio) return null
  const simbolo = (p.item_moneda ?? 'USD') === 'USD' ? '$' : `${p.item_moneda} `
  const ref = precioUSD(p)
  const bajo = umbral !== null && ref !== null && ref < umbral
  return (
    <span className="inline-flex items-center gap-1.5" title="Precio en MercadoLibre ahora (con la promoción, si hay)">
      <span className={`font-semibold num ${bajo ? 'text-amber-800 bg-amber-50 ring-1 ring-inset ring-amber-200 rounded-full px-2 py-0.5' : 'text-neutral-800'}`}>
        {simbolo}{usd(p.item_precio)}{bajo && ` · menos de $${umbral}`}
      </span>
      {p.item_precio_original && <span className="text-xs text-neutral-400 line-through num">{simbolo}{usd(p.item_precio_original)}</span>}
    </span>
  )
}

interface Cuenta { id: number; nickname: string; estado: string; ultima_sync: string | null; ultimo_error: string | null }
interface Datos {
  preguntas: Pregunta[]; total: number; page: number; tam: number
  contadores: { pendientes: number; respondidas: number; cerradas_sin_respuesta: number }
  cuentas: Cuenta[]; configuracion: { ml: boolean; ia: boolean }
  plantillas: Plantilla[]
}
type Vista = 'pendientes' | 'respondidas' | 'cuentas'

function hace(fecha: string) {
  const min = Math.round((Date.now() - new Date(fecha).getTime()) / 60000)
  if (min < 1) return 'recién'
  if (min < 60) return `hace ${min} min`
  const h = Math.round(min / 60)
  if (h < 48) return `hace ${h} h`
  return `hace ${Math.round(h / 24)} días`
}

const ESTADO_RESP: Record<string, { status: string; label: string }> = {
  ANSWERED: { status: 'FINALIZADA', label: 'Respondida' },
  CLOSED_UNANSWERED: { status: 'INCONSISTENTE', label: 'Cerrada sin respuesta' },
  BANNED: { status: 'INCONSISTENTE', label: 'Bloqueada por ML' },
  DELETED: { status: 'INACTIVO', label: 'Eliminada' },
  DISABLED: { status: 'INACTIVO', label: 'Deshabilitada' },
  UNDER_REVIEW: { status: 'PAGO_VERIFICADO', label: 'En revisión de ML' },
}

export default function PreguntasClient({ isAdmin }: { isAdmin: boolean }) {
  // ?vista=cuentas abre Políticas y respuestas rápidas (las cuentas de ML están en /cuentas-ml).
  const pedida = useSearchParams().get('vista')
  const [vista, setVista] = useState<Vista>(isAdmin && pedida === 'cuentas' ? 'cuentas' : 'pendientes')
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [datos, setDatos] = useState<Datos | null>(null)
  // De qué pestaña son los `datos` que hay en pantalla. Al pasar de Historial a Sin responder,
  // durante el viaje al servidor seguían los del Historial (ya respondidas) dibujados como
  // tarjetas pendientes. Mientras no coincida, se muestra "Cargando".
  const [datosDe, setDatosDe] = useState<string | null>(null)
  const ultimoPedido = useRef(0)
  const [sincronizando, setSincronizando] = useState(false)
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)

  const cargar = useCallback(async () => {
    const v = vista === 'respondidas' ? 'respondidas' : 'pendientes'
    const n = ++ultimoPedido.current
    const r = await fetch(`/api/preguntas?vista=${v}&page=${page}&q=${encodeURIComponent(q)}`)
    const d = await r.json().catch(() => ({}))
    // Una respuesta vieja (de la pestaña o página anterior) que llega tarde no pisa la actual.
    if (n !== ultimoPedido.current) return
    if (!r.ok) { setAviso({ tipo: 'error', texto: d.error ?? 'No se pudo cargar' }); return }
    setDatos(d)
    setDatosDe(v)
  }, [vista, page, q])

  useEffect(() => { cargar() }, [cargar])
  // Refresco suave cada minuto (el cron trae lo nuevo de ML).
  useEffect(() => { const t = setInterval(cargar, 60_000); return () => clearInterval(t) }, [cargar])

  const sincronizar = async () => {
    setSincronizando(true)
    try {
      const r = await fetch('/api/preguntas/sincronizar', { method: 'POST' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setAviso({ tipo: 'error', texto: d.error ?? 'No se pudo actualizar' }); return }
      const errores = (d.resultado as { cuenta: string; error?: string }[]).filter(x => x.error)
      if (errores.length) setAviso({ tipo: 'error', texto: errores.map(e => `${e.cuenta}: ${e.error}`).join(' · ') })
      await cargar()
    } finally { setSincronizando(false) }
  }

  // Vuelta del OAuth de MercadoLibre (?conectada= / ?ml_error=)
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    const ok = p.get('conectada'), err = p.get('ml_error')
    if (ok || err) {
      setAviso(ok ? { tipo: 'ok', texto: `Cuenta ${ok} conectada. Trayendo sus preguntas…` } : { tipo: 'error', texto: err! })
      window.history.replaceState(null, '', '/preguntas')
      if (ok) { setVista('pendientes'); sincronizar() }
      else setVista('cuentas')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const sinCuentas = datos && datos.cuentas.filter(c => c.estado === 'activa').length === 0
  const cont = datos?.contadores

  return (
    <div className="space-y-4">
      <PageHeader title="Preguntas" subtitle="Todas las preguntas de tus cuentas de MercadoLibre en una bandeja, con respuesta sugerida por IA"
        actions={<>
          <UsoIA />
          <button onClick={sincronizar} disabled={sincronizando || !!sinCuentas} className="btn-secondary text-sm">
            {sincronizando ? 'Actualizando…' : 'Actualizar ahora'}
          </button>
        </>} />

      {datos && (!datos.configuracion.ml || !datos.configuracion.ia) && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-2.5 rounded-lg text-sm">
          Falta configurar en el servidor:{' '}
          {[!datos.configuracion.ml && 'la app de MercadoLibre', !datos.configuracion.ia && 'la clave de la IA'].filter(Boolean).join(' y ')}.
        </div>
      )}
      {aviso && (
        <div className={`px-4 py-2.5 rounded-lg text-sm border flex items-start gap-3 ${aviso.tipo === 'ok' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-700'}`}>
          <span className="flex-1">{aviso.texto}</span>
          <button onClick={() => setAviso(null)} className="opacity-60 hover:opacity-100" aria-label="Cerrar">✕</button>
        </div>
      )}

      <Tabs value={vista} onChange={v => { setVista(v); setPage(1) }} items={[
        { value: 'pendientes', label: 'Sin responder', count: cont?.pendientes },
        { value: 'respondidas', label: 'Historial', count: cont?.respondidas },
        ...(isAdmin ? [{ value: 'cuentas' as const, label: 'Políticas y respuestas rápidas' }] : []),
      ]} />

      {vista === 'cuentas' ? (
        datos ? (
          <div className="space-y-4">
            <Plantillas iniciales={datos.plantillas} onGuardado={cargar} />
            <CuentasYPoliticas />
          </div>
        ) : <Cargando />
      ) : !datos || datosDe !== (vista === 'respondidas' ? 'respondidas' : 'pendientes') ? <Cargando /> : sinCuentas && datos.total === 0 ? (
        <div className="bg-white rounded-xl border border-neutral-200 shadow-sm">
          <EmptyState message="Aquí llegan las preguntas de todas tus cuentas de MercadoLibre, y la IA te propone cada respuesta para que solo la revises y publiques. Conecta tu cuenta para empezar: nunca se publica nada sin que tú lo revises."
            cta={isAdmin
              ? <a href="/conectar" className="btn-primary text-sm">Conectar ahora</a>
              : <span className="text-xs text-neutral-400">Pídele a un administrador que conecte las cuentas.</span>} />
        </div>
      ) : (
        <>
          {vista === 'respondidas' && (
            <input type="search" value={q} onChange={e => { setQ(e.target.value); setPage(1) }}
              placeholder="Buscar en preguntas, respuestas o publicaciones…"
              className="border border-neutral-300 rounded-lg px-3 py-2 text-sm w-full md:w-96" />
          )}
          {datos.preguntas.length === 0 ? (
            <div className="bg-white rounded-xl border border-neutral-200 shadow-sm">
              <EmptyState message={vista === 'pendientes' ? 'No hay preguntas sin responder. Todo al día.' : 'Sin resultados.'} />
            </div>
          ) : vista === 'pendientes' ? (
            <div className="space-y-3">
              {datos.preguntas.map(p => (
                <TarjetaPendiente key={p.id} p={p} esAdmin={isAdmin} iaLista={datos.configuracion.ia} plantillas={datos.plantillas}
                  onRespondida={msg => { setAviso(msg); cargar() }} />
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-neutral-200 shadow-sm divide-y divide-neutral-100">
              {datos.preguntas.map(p => <FilaHistorial key={p.id} p={p} />)}
            </div>
          )}
          <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
            <Pagination total={datos.total} page={page} pageSize={datos.tam} onChange={setPage} />
          </div>
        </>
      )}
    </div>
  )
}

// ── Pregunta sin responder ─────────────────────────────────────────────────
function TarjetaPendiente({ p, esAdmin, iaLista, plantillas, onRespondida }: {
  p: Pregunta; esAdmin: boolean; iaLista: boolean; plantillas: Plantilla[]; onRespondida: (a: { tipo: 'ok' | 'error'; texto: string }) => void
}) {
  const confirm = useConfirm()
  const [texto, setTexto] = useState(p.borrador ?? '')
  // De dónde salió el texto (se guarda al publicar, migración 062): IA, parecida, rápida o propia.
  const [origen, setOrigen] = useState<{ fuente: 'ia' | 'parecida' | 'rapida' | 'propia'; base: string }>(
    p.borrador ? { fuente: 'ia', base: p.borrador } : { fuente: 'propia', base: '' })
  const usar = (t: string, fuente: 'ia' | 'parecida' | 'rapida') => { setTexto(t); setOrigen({ fuente, base: t }) }
  const [eliminando, setEliminando] = useState(false)
  const [meta, setMeta] = useState({ confianza: p.borrador_confianza, falta: p.borrador_falta, web: p.borrador_web })
  const [pidiendo, setPidiendo] = useState<null | 'normal' | 'web'>(null)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nota, setNota] = useState<string | null>(null)
  const [sugerencias, setSugerencias] = useState<Sugerencia[]>([])
  useEffect(() => {
    let vivo = true
    fetch(`/api/preguntas/${p.id}/sugerencias`).then(r => r.ok ? r.json() : null).then(d => { if (vivo && d) setSugerencias(d.sugerencias) })
    return () => { vivo = false }
  }, [p.id])
  const problemas = texto.trim() ? problemasDelTexto(texto) : []
  const avisosTexto = texto.trim() ? revisarTexto(texto).avisos : []
  const [estadoItem, setEstadoItem] = useState(p.item_estado)
  const pausada = !!estadoItem && estadoItem !== 'active'

  const proponer = async (web: boolean) => {
    setPidiendo(web ? 'web' : 'normal'); setError(null)
    try {
      const r = await fetch(`/api/preguntas/${p.id}/borrador`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ web }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setError(d.error ?? 'La IA no respondió'); return }
      usar(d.borrador.respuesta, 'ia')
      setMeta({ confianza: d.borrador.confianza, falta: d.borrador.falta_dato, web: d.borrador.web })
      avisarUsoIA()
    } finally { setPidiendo(null) }
  }

  // Sin confirmación (07-10-2026, pedido del dueño): el texto ya está a la vista y revisado en la
  // tarjeta; "Publicar respuesta" publica directo para responder más rápido.
  const enviar = async () => {
    if (enviando) return
    setEnviando(true); setError(null)
    try {
      const r = await fetch(`/api/preguntas/${p.id}/responder`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texto, ...origen }),
      })
      const d = await r.json().catch(() => ({}))
      if (d.codigo === 'item_inactivo') setEstadoItem('paused')
      if (!r.ok) { setError([d.error, ...(d.problemas ?? [])].filter(Boolean).join(' · ')); return }
      onRespondida(d.publicada
        ? { tipo: 'ok', texto: `Respuesta publicada en ${p.cuenta}.` }
        : { tipo: 'error', texto: d.aviso ?? 'MercadoLibre no confirmó la publicación' })
    } finally { setEnviando(false) }
  }

  const eliminar = async () => {
    const ok = await confirm({
      title: 'Eliminar pregunta',
      message: `Se eliminará de la publicación en MercadoLibre (cuenta ${p.cuenta}). No se puede deshacer.

"${p.texto}"`,
      confirmText: 'Eliminar', danger: true,
    })
    if (!ok) return
    setEliminando(true); setError(null)
    try {
      const r = await fetch(`/api/preguntas/${p.id}`, { method: 'DELETE' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setError(d.error ?? 'No se pudo eliminar'); return }
      onRespondida({ tipo: 'ok', texto: `Pregunta eliminada de ${p.cuenta}.` })
    } finally { setEliminando(false) }
  }

  const guardarNota = async () => {
    if (!nota?.trim()) return
    const r = await fetch('/api/preguntas/notas', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ item_id: p.item_id, texto: nota }),
    })
    if (r.ok) { setNota(null) } else { setError('No se pudo guardar el dato') }
  }

  const tonoConfianza = meta.confianza === 'alta' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
    : meta.confianza === 'media' ? 'bg-amber-50 text-amber-700 ring-amber-200' : 'bg-red-50 text-red-700 ring-red-200'

  return (
    <article className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4 space-y-3">
      <header className="flex gap-3 text-xs text-neutral-500">
        <Foto p={p} />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-semibold text-neutral-700 bg-neutral-100 rounded-full px-2 py-0.5">{p.cuenta}</span>
            {pausada && <span className="text-amber-700 bg-amber-50 ring-1 ring-amber-200 rounded-full px-2 py-0.5">Publicación {estadoItem === 'paused' ? 'pausada' : estadoItem} · no se puede responder</span>}
            <span className="ml-auto whitespace-nowrap" title={new Date(p.fecha).toLocaleString('es-VE')}>{hace(p.fecha)}</span>
            {p.comprador_id && (
              <PreguntasPrevias n={p.previas} cargar={() =>
                fetch(`/api/preguntas/comprador?id=${p.comprador_id}&excluir=${p.id}`).then(r => (r.ok ? r.json() : []))} />
            )}
          </div>
          <Producto p={p} umbral={umbralDe(plantillas)} />
        </div>
      </header>

      <p className="text-base text-neutral-900">{p.texto}</p>

      <div className="space-y-2">
        <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={3} maxLength={2000}
          placeholder="Escribe la respuesta o pídele una propuesta a la IA…"
          className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm resize-y" />
        {(meta.confianza || meta.falta || meta.web) && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {meta.confianza && <span className={`rounded-full px-2 py-0.5 ring-1 ring-inset ${tonoConfianza}`}>Confianza {meta.confianza}</span>}
            {meta.web && <span className="rounded-full px-2 py-0.5 ring-1 ring-inset bg-amber-50 text-amber-800 ring-amber-200">Con datos de internet: verificar antes de enviar</span>}
            {meta.falta && <span className="text-neutral-600">No encontré: <b>{meta.falta}</b></span>}
          </div>
        )}
        {problemas.length > 0 && <p className="text-xs text-red-600">MercadoLibre la rechazaría: {problemas.join(' · ')}</p>}
        {avisosTexto.length > 0 && <p className="text-xs text-amber-700">Ojo: {avisosTexto.join(' · ')}. Puedes publicar igual; al publicar se verifica si quedó.</p>}
        {error && <p className="text-xs text-red-600">{error}</p>}
        {pausada && (
          <Reponer id={p.id} esAdmin={esAdmin} hayTexto={!!texto.trim() && problemas.length === 0}
            onRepuesta={(estado, publicar) => { setEstadoItem(estado); setError(null); if (publicar && estado === 'active') enviar() }} />
        )}
      </div>

      <Sugerencias lista={sugerencias} etiqueta="Parecidas:"
        onUsar={t => { usar(t, 'parecida'); setMeta({ confianza: null, falta: null, web: false }) }} />

      {plantillas.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-neutral-400 mr-1">Respuestas rápidas:</span>
          {plantillas.map((pl, i) => {
            const aplica = plantillaAplica(pl, precioUSD(p))
            const condicionada = pl.precio_desde != null || pl.precio_hasta != null
            return (
              <button key={i} type="button" onClick={() => { usar(pl.texto, 'rapida'); setMeta({ confianza: null, falta: null, web: false }) }}
                title={`${pl.texto}\n\nPara ${condicionPlantilla(pl)}`}
                className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                  aplica && condicionada ? 'bg-lime-50 border-lime-300 text-lime-900 hover:bg-lime-100'
                  : aplica ? 'bg-white border-neutral-300 text-neutral-700 hover:border-neutral-500'
                  : 'bg-white border-neutral-200 text-neutral-400 hover:text-neutral-600'}`}>
                {aplica && condicionada && '✓ '}{pl.titulo}
              </button>
            )
          })}
        </div>
      )}

      <footer className="flex flex-wrap items-center gap-2">
        <button onClick={() => proponer(false)} disabled={!iaLista || !!pidiendo} className="btn-secondary text-sm">
          {pidiendo === 'normal' ? 'Pensando…' : texto ? 'Proponer otra' : 'Proponer con IA'}
          {pidiendo !== 'normal' && <span className="ml-1.5 text-xs font-normal text-neutral-400">· {CREDITOS_TXT}</span>}
        </button>
        {meta.falta && (
          <button onClick={() => proponer(true)} disabled={!iaLista || !!pidiendo} className="btn-ghost text-sm"
            title="La IA busca datos técnicos del producto en internet">
            {pidiendo === 'web' ? 'Buscando…' : 'Buscar en internet'}
            {pidiendo !== 'web' && <span className="ml-1.5 text-xs font-normal text-neutral-400">· {CREDITOS_WEB_TXT}</span>}
          </button>
        )}
        <button onClick={() => setNota(nota === null ? '' : null)} className="btn-ghost text-sm"
          title="Un dato de esta publicación que la IA debe saber la próxima vez">
          Anotar dato del producto
        </button>
        <button onClick={eliminar} disabled={eliminando} className="btn-ghost text-sm text-red-600 hover:text-red-700"
          title="Para preguntas imprudentes u ofensivas: la quita de la publicación en MercadoLibre">
          {eliminando ? 'Eliminando…' : 'Eliminar'}
        </button>
        <button onClick={enviar} disabled={enviando || !texto.trim() || problemas.length > 0} className="btn-primary text-sm ml-auto">
          {enviando ? 'Publicando…' : 'Publicar respuesta'}
        </button>
      </footer>

      {nota !== null && (
        <div className="flex gap-2">
          <input value={nota} onChange={e => setNota(e.target.value)} maxLength={500} autoFocus
            placeholder="p. ej. Mide 30 × 20 cm y funciona con 110 V"
            className="flex-1 border border-neutral-300 rounded-lg px-3 py-2 text-sm" />
          <button onClick={guardarNota} className="btn-secondary text-sm">Guardar dato</button>
        </div>
      )}
    </article>
  )
}

// ── Historial ──────────────────────────────────────────────────────────────
function FilaHistorial({ p }: { p: Pregunta }) {
  const e = ESTADO_RESP[p.estado] ?? { status: 'INACTIVO', label: p.estado }
  return (
    <div className="px-4 py-3 text-sm flex gap-3">
      <Foto p={p} chica />
      <div className="min-w-0 flex-1 space-y-1">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
        <span className="font-semibold text-neutral-700">{p.cuenta}</span>
        <Producto p={p} />
        <span className="ml-auto whitespace-nowrap">{new Date(p.respuesta_fecha ?? p.fecha).toLocaleDateString('es-VE')}</span>
        <StatusBadge status={e.status} label={e.label} />
      </div>
      <p className="text-neutral-900">{p.texto}</p>
      {p.respuesta && (
        <p className="text-neutral-600 pl-3 border-l-2 border-neutral-200">
          {p.respuesta}
          <span className="text-xs text-neutral-400"> · {p.respondida_por ?? 'desde MercadoLibre'}</span>
        </p>
      )}
      </div>
    </div>
  )
}

// ── Cuentas conectadas + políticas para la IA ──────────────────────────────
// Las cuentas de ML viven en su pantalla (/cuentas-ml); aquí quedan las políticas para la IA.
function CuentasYPoliticas() {
  const [politicas, setPoliticas] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [ok, setOk] = useState(false)

  useEffect(() => {
    fetch('/api/settings').then(r => r.json()).then(s => setPoliticas(s.preguntas_politicas ?? '')).catch(() => {})
  }, [])

  const guardar = async () => {
    setGuardando(true); setOk(false)
    const r = await fetch('/api/settings', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ preguntas_politicas: politicas }),
    })
    setGuardando(false); setOk(r.ok)
  }

  return (
    <div className="grid gap-4">
      <section className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4 space-y-3">
        <h2 className="font-semibold text-neutral-900">Políticas para la IA</h2>
        <p className="text-xs text-neutral-500">
          Lo que la IA debe saber de tu negocio. Escríbelo como se lo explicarías a un empleado nuevo. La IA no inventa nada fuera de esto.
        </p>
        <textarea value={politicas} onChange={e => { setPoliticas(e.target.value); setOk(false) }} rows={12}
          placeholder={'Ej.:\n- Pagos: pago móvil y transferencia (Banesco, Mercantil, Venezuela) a tasa BCV del día.\n- Envíos: por Zoom o Tealca, cobro a destino; salen de lunes a viernes.\n- Entregas en Caracas: …\n- Factura: sí emitimos, pedir datos por la mensajería de la venta.\n- Horario: lunes a sábado de 9 a 6.'}
          className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm font-mono resize-y" />
        <div className="flex items-center justify-end gap-3">
          {ok && <span className="text-xs text-emerald-700">Guardado</span>}
          <button onClick={guardar} disabled={guardando} className="btn-primary text-sm">{guardando ? 'Guardando…' : 'Guardar políticas'}</button>
        </div>
      </section>
    </div>
  )
}

// ── Respuestas rápidas (editor) ────────────────────────────────────────────
function Plantillas({ iniciales, onGuardado }: { iniciales: Plantilla[]; onGuardado: () => void }) {
  const [lista, setLista] = useState<Plantilla[]>(iniciales)
  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null)
  const num = (v: string) => v.trim() === '' ? null : Number(v.replace(',', '.'))
  const cambiar = (i: number, c: Partial<Plantilla>) => { setLista(l => l.map((p, j) => j === i ? { ...p, ...c } : p)); setMsg(null) }

  const guardar = async () => {
    const limpias = lista.map(p => ({ ...p, titulo: p.titulo.trim(), texto: p.texto.trim() })).filter(p => p.titulo && p.texto)
    const malas = limpias.filter(p => problemasDelTexto(p.texto).length)
    if (malas.length) { setMsg({ ok: false, t: `"${malas[0].titulo}": ${problemasDelTexto(malas[0].texto).join(', ')}` }); return }
    setGuardando(true)
    const r = await fetch('/api/settings', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preguntas_plantillas: JSON.stringify(limpias) }),
    })
    setGuardando(false)
    if (!r.ok) { setMsg({ ok: false, t: 'No se pudo guardar' }); return }
    setLista(limpias); setMsg({ ok: true, t: 'Guardadas' }); onGuardado()
  }

  return (
    <section className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold text-neutral-900">Respuestas rápidas</h2>
          <p className="text-xs text-neutral-500">Salen como botones en cada pregunta (un clic y la puedes retocar). La IA también las usa. Con precio, se marca en verde la que corresponde al producto.</p>
        </div>
        <button onClick={() => setLista(l => [...l, { titulo: '', texto: '', precio_desde: null, precio_hasta: null }])}
          className="btn-secondary text-sm whitespace-nowrap">+ Agregar</button>
      </div>
      {lista.length === 0 && <p className="text-sm text-neutral-400">Todavía no hay respuestas rápidas.</p>}
      <div className="space-y-3">
        {lista.map((p, i) => (
          <div key={i} className="border border-neutral-200 rounded-lg p-3 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <input value={p.titulo} onChange={e => cambiar(i, { titulo: e.target.value })} placeholder="Nombre corto (ej. Disponible + envío gratis)"
                className="flex-1 min-w-[14rem] border border-neutral-300 rounded-lg px-3 py-1.5 text-sm font-medium" />
              <label className="text-xs text-neutral-500 flex items-center gap-1">desde $
                <input value={p.precio_desde ?? ''} onChange={e => cambiar(i, { precio_desde: num(e.target.value) })} inputMode="decimal"
                  className="w-16 border border-neutral-300 rounded-lg px-2 py-1.5 text-sm" placeholder="—" />
              </label>
              <label className="text-xs text-neutral-500 flex items-center gap-1">menos de $
                <input value={p.precio_hasta ?? ''} onChange={e => cambiar(i, { precio_hasta: num(e.target.value) })} inputMode="decimal"
                  className="w-16 border border-neutral-300 rounded-lg px-2 py-1.5 text-sm" placeholder="—" />
              </label>
              <button onClick={() => setLista(l => l.filter((_, j) => j !== i))} className="btn-ghost text-xs text-red-600">Quitar</button>
            </div>
            <textarea value={p.texto} onChange={e => cambiar(i, { texto: e.target.value })} rows={2} maxLength={2000}
              placeholder="Texto de la respuesta" className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm resize-y" />
          </div>
        ))}
      </div>
      <div className="flex items-center justify-end gap-3">
        {msg && <span className={`text-xs ${msg.ok ? 'text-emerald-700' : 'text-red-600'}`}>{msg.t}</span>}
        <button onClick={guardar} disabled={guardando} className="btn-primary text-sm">{guardando ? 'Guardando…' : 'Guardar respuestas rápidas'}</button>
      </div>
    </section>
  )
}

/** Publicación pausada (sin stock): MercadoLibre no deja responder. Reponer la cantidad desde aquí
 *  (admin) y, si ya hay respuesta escrita, publicarla en el mismo paso. */
function Reponer({ id, esAdmin, hayTexto, onRepuesta }: {
  id: string; esAdmin: boolean; hayTexto: boolean; onRepuesta: (estado: string, publicar: boolean) => void
}) {
  const [info, setInfo] = useState<{ disponible: number; variantes: { id: string; nombre: string; disponible: number }[] } | null>(null)
  const [cantidad, setCantidad] = useState('')
  const [variante, setVariante] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!esAdmin) return
    let vivo = true
    fetch(`/api/preguntas/${id}/reponer`).then(r => r.ok ? r.json() : null).then(d => { if (vivo && d) setInfo(d) }).catch(() => {})
    return () => { vivo = false }
  }, [id, esAdmin])

  const reponer = async (publicar: boolean) => {
    const n = parseInt(cantidad, 10)
    if (!(n >= 1)) return
    setEnviando(true); setError(null)
    try {
      const r = await fetch(`/api/preguntas/${id}/reponer`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cantidad: n, variante_id: variante || null }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setError(d.error ?? 'No se pudo reponer'); return }
      if (d.estado !== 'active') { setError('Se cargó el stock, pero MercadoLibre todavía la muestra pausada. Actívala en MercadoLibre y vuelve a publicar.'); return }
      onRepuesta(d.estado, publicar)
    } finally { setEnviando(false) }
  }

  const conVariantes = (info?.variantes.length ?? 0) > 0
  return (
    <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 space-y-2 text-sm">
      <p className="text-amber-900">
        <b>MercadoLibre no deja responder:</b> la publicación está pausada, casi siempre porque se quedó sin stock.
        {esAdmin ? ' Si tienes unidades, repónlas aquí y se reactiva. Si no, elimina la pregunta.' : ' Pídele a un administrador que reponga el stock, o elimina la pregunta.'}
      </p>
      {esAdmin && (
        <div className="flex flex-wrap items-center gap-2">
          {conVariantes && (
            <select value={variante} onChange={e => setVariante(e.target.value)} className="border border-neutral-300 rounded-lg px-2 py-1.5 text-sm bg-white">
              <option value="">Elige la variante…</option>
              {info!.variantes.map(v => <option key={v.id} value={v.id}>{v.nombre} ({v.disponible} u.)</option>)}
            </select>
          )}
          <input inputMode="numeric" value={cantidad} onChange={e => setCantidad(e.target.value.replace(/\D/g, '').slice(0, 5))}
            placeholder="Unidades" className="w-24 border border-neutral-300 rounded-lg px-2 py-1.5 text-sm text-right num bg-white" />
          <button onClick={() => reponer(false)} disabled={enviando || !cantidad || (conVariantes && !variante)} className="btn-secondary text-sm">
            {enviando ? 'Reponiendo…' : 'Reponer stock'}
          </button>
          {hayTexto && (
            <button onClick={() => reponer(true)} disabled={enviando || !cantidad || (conVariantes && !variante)} className="btn-primary text-sm">
              Reponer y publicar respuesta
            </button>
          )}
        </div>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
